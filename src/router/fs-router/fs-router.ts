import { promises as fs } from "node:fs";
import { join, parse, relative } from "node:path";
import ts from "typescript";
import type { HTTPMethod } from "../../types";
import type { RouteConfig, RouteDefinition } from "./types";
import { METHOD_NAME_ALL_LOWERCASE, METHODS } from "../types";

export class FsRouter {
  private routes: {
    method: string;
    path: string;
    handler: unknown;
    params: { name: string }[];
    fullPath: string;
  }[] = [];
  private config: Required<RouteConfig>;
  private program: ts.Program | undefined;

  constructor(config: RouteConfig) {
    this.config = {
      extensions: [".js", ".jsx", ".tsx", ".ts"],
      generateTypes: false,
      dev: false,
      tsConfigPath: "tsconfig.json",
      ...config,
    };

    if (this.config.generateTypes && this.config.dev) {
      const { config: jsonConfig, error } = ts.readConfigFile(
        this.config.tsConfigPath,
        ts.sys.readFile
      );

      if (error) {
        throw new Error(`Error reading tsconfig.json: ${error.messageText}`);
      }

      const parsedConfig = ts.parseJsonConfigFileContent(
        jsonConfig,
        ts.sys,
        process.cwd()
      );

      if (parsedConfig.errors.length) {
        throw new Error(
          `Error parsing tsconfig.json: ${parsedConfig.errors
            .map((e) => e.messageText)
            .join("\n")}`
        );
      }

      this.program = ts.createProgram(
        parsedConfig.fileNames,
        parsedConfig.options
      );
    }
  }

  async initialize(): Promise<void> {
    await this.scanRoutes(this.config.routesDir);
    if (this.config.generateTypes) {
      await this.generateTypeDefinitions();
    }
  }

  private async scanRoutes(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        await this.scanRoutes(fullPath);
        continue;
      }

      const { ext } = parse(entry.name);
      if (!this.config.extensions.includes(ext)) continue;

      const route = await this.processRouteFile(fullPath);
      if (route) {
        this.routes.push(...route);
      }
    }
  }

  private async processRouteFile(
    fullPath: string
  ){
    try {
      const relativePath = relative(this.config.routesDir, fullPath);
      const routePath = this.filePathToRoutePath(relativePath);
      // replace `$` with `:`
      const normalizedPath = routePath.replace(/\$/g, ":");
      const exports = await this.getMethodAndHandlers(fullPath);
      const params = this.getRouteParamTypes(routePath);

      return Object.entries(exports).map(([method, handler]) => ({
        method: method.toUpperCase(),
        path: normalizedPath,
        handler,
        fullPath,
        params,
      }));
    } catch (error) {
      console.error(`Error processing route file ${fullPath}:`, error);
      return null;
    }
  }

  private async getMethodAndHandlers(
    filePath: string
  ): Promise<RouteDefinition["exports"]> {
    const exports = await import(filePath);
    return exports as RouteDefinition["exports"];
  }

  private filePathToRoutePath(filePath: string): string {
    const { dir, name } = parse(filePath);
    const parts = dir.split("/").filter(Boolean);

    const routeParts = parts.map((part) => {
      if (part.startsWith("$")) {
        return `:${part.slice(1)}`;
      }
      return part;
    });

    return name === "index"
      ? `/${routeParts.join("/")}`
      : `/${[...routeParts, name].join("/")}`;
  }

  private async generateTypeDefinitions(): Promise<void> {
    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
    const sourceFile = ts.createSourceFile(
      "generated-routes.d.ts",
      "",
      ts.ScriptTarget.Latest,
      false,
      ts.ScriptKind.TS
    );

    const routeTypes = this.routes.map((route) => {
      const types = this.analyzeRouteFile(route.fullPath) as Record<
        string,
        ts.Node
      >;

      const methodTypes = Object.entries(types).map(([method, node]) => {
        const type = this.getDetailedSymbolType(node, this.program!.getTypeChecker());
        return ts.factory.createPropertySignature(
          undefined,
          ts.factory.createStringLiteral(method),
          undefined,
          ts.factory.createTypeReferenceNode(type)
        );
      });

      return ts.factory.createPropertySignature(
        undefined,
        ts.factory.createStringLiteral(route.path),
        undefined,
        ts.factory.createTypeLiteralNode([
          ts.factory.createPropertySignature(
            undefined,
            ts.factory.createIdentifier("params"),
            undefined,
            ts.factory.createTypeLiteralNode(
              route.params.map(({ name }) =>
                ts.factory.createPropertySignature(
                  undefined,
                  ts.factory.createIdentifier(name),
                  undefined,
                  ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword)
                )
              )
            )
          ),
          ...methodTypes
        ])
      );
    });

    const interfaceDeclaration = ts.factory.createInterfaceDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      ts.factory.createIdentifier("GeneratedRoutes"),
      undefined,
      undefined,
      routeTypes
    );

    const resultFile = ts.factory.createSourceFile(
      [interfaceDeclaration],
      ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
      ts.NodeFlags.None
    );

    const output = printer.printNode(
      ts.EmitHint.Unspecified,
      resultFile,
      sourceFile
    );

    await fs.writeFile(
      join(this.config.routesDir, "../generated-routes.d.ts"),
      `// Generated by FsRouter\n\n${output}`
    );
  }

  private getRouteParamTypes(routePath: string) {
    const params:{ name: string }[] = [];
    const dynamicSegments = routePath.match(/\$\w+/g) || [];

    dynamicSegments.forEach((segment) => {
      if (segment.startsWith("$")) {
        params.push({ name: segment.slice(1) });
      }
    });

    return params;
  }

  private isValidMethod(method: string): method is HTTPMethod {
    return [...METHODS, METHOD_NAME_ALL_LOWERCASE].includes(
      method as HTTPMethod
    );
  }

  private analyzeRouteFile(filePath: string): Record<string, any> {
    const sourceFile = this.program!.getSourceFile(filePath);
    if (!sourceFile) return {};

    const exports: RouteDefinition["exports"] = {};
    const checker = this.program!.getTypeChecker();

    const processExport = (node: ts.Node, methodName: string) => {
      if (this.isValidMethod(methodName)) {
        exports[methodName.toLowerCase() as HTTPMethod] = node;
      }
    };

    ts.forEachChild(sourceFile, (node) => {
      if (ts.isExportAssignment(node)) {
        processExport(node.expression, "get");
      } else if (
        ts.isFunctionDeclaration(node) &&
        node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        const methodName = node.name?.text.toLowerCase() ?? "";
        processExport(node, methodName);
      } else if (
        ts.isVariableStatement(node) &&
        node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        node.declarationList.declarations.forEach((declaration) => {
          if (ts.isIdentifier(declaration.name)) {
            processExport(declaration, declaration.name.text);
          }
        });
      }
    });

    return exports;
  }

  private getDetailedSymbolType(
    node: ts.Node,
    checker: ts.TypeChecker
  ): string {
    const type = checker.getTypeAtLocation(node);
    let typeString = checker.typeToString(
      type,
      undefined,
      ts.TypeFormatFlags.NoTruncation
    );

    // typeString = typeString
    //   .replace(/Promise<(.+)>/, "$1")
    //   .replace(/\{\s+\[x: string\]: any;\s+\}/g, "Record<string, any>");

    return typeString;
  }

  getRoutes(): ReadonlyArray<{
    method: string;
    path: string;
    handler: unknown;
  }> {
    return this.routes;
  }
}
