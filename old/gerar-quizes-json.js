const fs = require('fs');
const path = require('path');

// Diretório raiz dos quizzes
const quizRoot = path.join(__dirname, 'quizes-da-nuvem');

function listFilesRecursive(dir, webRoot = "") {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (let file of files) {
    const relPath = path.posix.join(webRoot, file.name);
    const absPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      results.push({
        type: "folder",
        name: file.name,
        children: listFilesRecursive(absPath, relPath)
      });
    } else if (file.isFile() && file.name.endsWith(".txt")) {
      results.push({
        type: "file",
        name: file.name,
        path: relPath.replace(/\\/g, "/")
      });
    }
  }
  return results;
}

const tree = listFilesRecursive(quizRoot, "quizes-da-nuvem");
fs.writeFileSync(path.join(__dirname, 'quizes.json'), JSON.stringify(tree, null, 2));
console.log("quizes.json gerado!");