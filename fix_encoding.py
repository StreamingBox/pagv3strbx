import sys

replacements = {
    'Ã³': 'ó',
    'Ã±': 'ñ',
    'Â¿': '¿',
    'Ã©': 'é',
    'Ã¡': 'á',
    'Ã­': 'í',
    'Â¡': '¡',
    'âœ…': '✅',
    'ðŸ“±': '📱',
    'Â·': '·',
    'Ã¼': 'ü',
    'Ã¨': 'è',
    'â”€': '─',
    'Â©': '©',
    'Ã': 'í', # Catch-all for some Ã­ cases if they look like Ã
}

file_path = r'c:\Users\deyby\OneDrive\Documentos\Desarrollos\pageV3\frontend\src\pages\Auth.jsx'

with open(file_path, 'r', encoding='latin1') as f:
    content = f.read()

for old, new in replacements.items():
    content = content.replace(old, new)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed encoding in Auth.jsx")
