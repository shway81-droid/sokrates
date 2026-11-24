// 브라우저용 파일(전역 + module.exports 겸용)을 Node 테스트에서 불러옵니다.
const path = require("node:path");
module.exports.load = (relPath) => require(path.join(__dirname, "..", relPath));
