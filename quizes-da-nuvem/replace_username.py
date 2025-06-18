import os
import re

# Nome de usuário antigo e novo
OLD = 'AndreHero007'
NEW = 'projsMED'

# Regex para encontrar links do GitHub Pages com o usuário antigo (case-insensitive)
pattern = re.compile(r'https://%s\.github\.io' % re.escape(OLD), re.IGNORECASE)

def replace_in_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    new_content = pattern.sub(f'https://{NEW}.github.io', content)
    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f'Arquivo atualizado: {filepath}')

if __name__ == '__main__':
    for root, dirs, files in os.walk('.'):
        for filename in files:
            if filename.lower().endswith('.txt'):
                replace_in_file(os.path.join(root, filename))
