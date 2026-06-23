import os
import re

def fix_file(filepath):
    with open(filepath, "r") as f:
        content = f.read()
    
    # regex to replace `xyz.status()` with `xyz.status` where xyz is any variable name that starts with 'r' (like res, res1, r1)
    new_content = re.sub(r'(res\w*|r\w*|\w+Response)\??\.status\(\)', r'\1.status', content)
    # also replace any `.status()` on non-context things. 
    # If the file imports Context or anything, wait, `c.status()` is valid.
    
    # check if `c.finalResponse?.status()`
    new_content = new_content.replace("c.finalResponse?.status()", "c.finalResponse?.status")
    
    if new_content != content:
        with open(filepath, "w") as f:
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
