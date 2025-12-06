import os
from pathlib import Path

def gerar_arquivo_unico(
    pasta_base: str = ".",
    pasta_js: str = "js",
    pasta_css: str = "css",
    nome_saida: str = "inde.html.txt"
):
    base = Path(pasta_base).resolve()
    dir_js = base / pasta_js
    dir_css = base / pasta_css
    arquivo_saida = base / nome_saida

    with open(arquivo_saida, "w", encoding="utf-8") as saida:
        saida.write("/* Arquivo gerado automaticamente para envio à IA */\n\n")

        # CSS primeiro
        if dir_css.is_dir():
            for caminho_css in sorted(dir_css.glob("*.css")):
                caminho_rel = caminho_css.relative_to(base)
                saida.write(f"/* ===== CSS: {caminho_rel} ===== */\n")
                with open(caminho_css, "r", encoding="utf-8") as fcss:
                    saida.write(fcss.read())
                saida.write("\n\n")
        else:
            saida.write("/* Pasta CSS não encontrada: " + str(dir_css) + " */\n\n")

        # JS depois
        if dir_js.is_dir():
            for caminho_js in sorted(dir_js.glob("*.js")):
                caminho_rel = caminho_js.relative_to(base)
                saida.write(f"/* ===== JS: {caminho_rel} ===== */\n")
                with open(caminho_js, "r", encoding="utf-8") as fjs:
                    saida.write(fjs.read())
                saida.write("\n\n")
        else:
            saida.write("/* Pasta JS não encontrada: " + str(dir_js) + " */\n\n")

    print(f"Arquivo gerado em: {arquivo_saida}")

if __name__ == "__main__":
    # Ajuste os parâmetros se suas pastas tiverem outros nomes
    gerar_arquivo_unico()
