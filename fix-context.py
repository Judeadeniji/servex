import os
import glob

def fix_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    new_content = content.replace("new Context(", "createContext(")
    new_content = new_content.replace("import { Context }", "import { type Context, createContext }")
    new_content = new_content.replace("import { Context,", "import { type Context, createContext,")
    
    # fix getters
    new_content = new_content.replace(".res.", ".res().")
    new_content = new_content.replace(".header.", ".header().")
    new_content = new_content.replace(".status ", ".status() ")
    new_content = new_content.replace(".status;", ".status();")
    new_content = new_content.replace(".status)", ".status())")
    
    # some tests use ctx.header without anything
    new_content = new_content.replace("ctx.header\n", "ctx.header()\n")
    new_content = new_content.replace("c.header\n", "c.header()\n")
    
    if new_content != content:
        with open(filepath, 'w') as f:
            f.write(new_content)
        print("Fixed", filepath)

for root, _, files in os.walk("src"):
    for file in files:
        if file.endswith(".ts"):
            fix_file(os.path.join(root, file))

for root, _, files in os.walk("tests"):
    for file in files:
        if file.endswith(".ts"):
            fix_file(os.path.join(root, file))

