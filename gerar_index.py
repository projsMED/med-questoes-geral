import os
import json

# Nome da pasta onde estão os quizes
TARGET_FOLDER = 'quizes-da-nuvem'
# Nome do arquivo de índice a ser gerado
INDEX_FILENAME = 'index.json'

def get_directory_structure(rootdir):
    """
    Percorre diretórios recursivamente e retorna a estrutura
    no formato esperado pelo Quiz Engine V3.
    """
    structure = []
    
    try:
        # Lista e ordena itens (para ficar alfabético)
        with os.scandir(rootdir) as entries:
            # Ordena: Pastas primeiro, depois arquivos, ambos alfabeticamente
            sorted_entries = sorted(entries, key=lambda e: (not e.is_dir(), e.name.lower()))
            
            for entry in sorted_entries:
                # Ignora o próprio arquivo index.json para não criar loop
                if entry.name == INDEX_FILENAME:
                    continue
                
                # Caminho relativo para o navegador (força barras / mesmo no Windows)
                # O caminho deve incluir a pasta raiz (ex: quizes-da-nuvem/pasta/arquivo.json)
                relative_path = entry.path.replace(os.sep, '/')

                if entry.is_dir():
                    # É uma pasta: chama recursivamente
                    children = get_directory_structure(entry.path)
                    
                    # Adiciona à estrutura como tipo 'folder'
                    structure.append({
                        "type": "folder",
                        "name": entry.name,
                        "children": children
                    })
                
                elif entry.is_file() and entry.name.lower().endswith('.json'):
                    # É um arquivo JSON: adiciona como tipo 'file'
                    # Remove a extensão .json do nome para ficar bonito na UI
                    display_name = os.path.splitext(entry.name)[0]
                    
                    structure.append({
                        "type": "file",
                        "name": display_name,
                        "path": relative_path
                    })
                    
    except FileNotFoundError:
        print(f"Erro: A pasta '{rootdir}' não foi encontrada.")
        return []

    return structure

def main():
    # Verifica se a pasta alvo existe
    if not os.path.exists(TARGET_FOLDER):
        print(f"Criando pasta '{TARGET_FOLDER}'...")
        os.makedirs(TARGET_FOLDER)

    print(f"Escaneando '{TARGET_FOLDER}'...")
    data = get_directory_structure(TARGET_FOLDER)
    
    output_path = os.path.join(TARGET_FOLDER, INDEX_FILENAME)
    
    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        print("-" * 30)
        print(f"SUCESSO! Arquivo gerado em: {output_path}")
        print(f"Total de itens na raiz: {len(data)}")
        print("-" * 30)
    except Exception as e:
        print(f"Erro ao salvar o arquivo: {e}")

if __name__ == "__main__":
    main()