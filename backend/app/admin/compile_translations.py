#!/usr/bin/env python
"""
Script to compile .po translation files to .mo files.
Run this after modifying .po files:
    python compile_translations.py
"""

import os
import subprocess
import sys


def compile_translations():
    """Compile all .po files to .mo files."""
    locales_dir = os.path.join(os.path.dirname(__file__), "locales")
    
    for language in os.listdir(locales_dir):
        lc_messages_dir = os.path.join(locales_dir, language, "LC_MESSAGES")
        if not os.path.isdir(lc_messages_dir):
            continue
        
        po_file = os.path.join(lc_messages_dir, "admin.po")
        mo_file = os.path.join(lc_messages_dir, "admin.mo")
        
        if os.path.exists(po_file):
            print(f"Compiling {language}...")
            try:
                subprocess.run(
                    ["msgfmt", "-o", mo_file, po_file],
                    check=True,
                    capture_output=True,
                )
                print(f"  Created {mo_file}")
            except FileNotFoundError:
                print(f"  Warning: msgfmt not found. Using babel...")
                try:
                    from babel.messages.frontend import compile_catalog
                    compiler = compile_catalog()
                    compiler.input_file = po_file
                    compiler.output_file = mo_file
                    compiler.run()
                    print(f"  Created {mo_file}")
                except ImportError:
                    print(f"  Error: babel not installed. Run: pip install babel")
                    sys.exit(1)
            except subprocess.CalledProcessError as e:
                print(f"  Error: {e.stderr.decode()}")
                sys.exit(1)
    
    print("\nAll translations compiled successfully!")


if __name__ == "__main__":
    compile_translations()
