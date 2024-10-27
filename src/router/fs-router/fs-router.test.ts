import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FsRouter } from './fs-router';
import { promises as fs } from 'node:fs';
import path from 'node:path';

vi.mock('node:fs', () => ({
    promises: {
        readdir: vi.fn(),
        writeFile: vi.fn(),
    },
}));

vi.mock(import("node:path"), async (importOriginal) => {
 const actual = await importOriginal();
 
    return {
        ...actual,
        resolve: (...args: string[]) => args.join('/'),
    };
});

describe('FsRouter', () => {
    let router: FsRouter;
    const config = {
        routesDir: '/routes',
        extensions: ['.js', '.ts'],
        generateTypes: false,
        dev: false,
        tsConfigPath: 'tsconfig.json',
    };

    beforeEach(() => {
        router = new FsRouter(config);
    });

    it('should initialize and scan routes', async () => {
        (fs.readdir as any).mockResolvedValueOnce([
            { name: 'index.ts', isDirectory: () => false },
            { name: 'user', isDirectory: () => true },
        ]);

        (fs.readdir as any).mockResolvedValueOnce([
            { name: 'profile.ts', isDirectory: () => false },
        ]);

        vi.spyOn(router as any, 'processRouteFile').mockResolvedValueOnce([
            { method: 'GET', path: '/', handler: vi.fn(), params: [], fullPath: '/routes/index.ts' },
        ]);

        vi.spyOn(router as any, 'processRouteFile').mockResolvedValueOnce([
            { method: 'GET', path: '/user/profile', handler: vi.fn(), params: [], fullPath: '/routes/user/profile.ts' },
        ]);

        await router.initialize();

        expect(router.getRoutes().toReversed()).toEqual([
            { method: 'GET', path: '/', handler: expect.any(Function), params: [], fullPath: '/routes/index.ts' },
            { method: 'GET', path: '/user/profile', handler: expect.any(Function), params: [], fullPath: '/routes/user/profile.ts' },
        ]);
    });

    it('should process route file and return route definitions', async () => {
        const fullPath = '/routes/index.ts';
        const exports = { get: vi.fn() };

        vi.spyOn(router as any, 'getMethodAndHandlers').mockResolvedValueOnce(exports);

        const result = await (router as any).processRouteFile(fullPath);

        expect(result).toEqual([
            { method: 'GET', path: '/', handler: exports.get, params: [], fullPath },
        ]);
    });

    it('should convert file path to route path', () => {
        const filePath = 'user/$id/profile.ts';
        const result = (router as any).filePathToRoutePath(filePath);
        expect(result).toBe('/user/:id/profile');
    });

    it('should generate type definitions', async () => {
        router = new FsRouter({ ...config, generateTypes: true, dev: true });

        (fs.readdir as any).mockResolvedValueOnce([
            { name: 'index.ts', isDirectory: () => false },
        ]);

        vi.spyOn(router as any, 'processRouteFile').mockResolvedValueOnce([
            { method: 'GET', path: '/', handler: vi.fn(), params: [], fullPath: '/routes/index.ts' },
        ]);

        await router.initialize();

        expect(fs.writeFile).toHaveBeenCalledWith(
            '/generated-routes.d.ts',
            expect.stringContaining('export interface GeneratedRoutes'),
        );
    });

    it('should get route param types', () => {
        const routePath = '/user/$id/profile';
        const result = (router as any).getRouteParamTypes(routePath);
        expect(result).toEqual([{ name: 'id' }]);
    });

    it('should validate HTTP methods', () => {
        expect((router as any).isValidMethod('get')).toBe(true);
        expect((router as any).isValidMethod('post')).toBe(true);
        expect((router as any).isValidMethod('invalid')).toBe(false);
    });
});