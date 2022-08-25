const readline = require('readline');
const fs = require('fs');

const inFile = process.argv[2]
const outFile = process.argv[3]

const readInterface = readline.createInterface({
	input: fs.createReadStream(inFile)
});

const writeInterface = fs.createWriteStream(outFile)

readInterface.on('line', processLine);

function processLine(line) {
	const obj = JSON.parse(line);
	writeInterface.write(JSON.stringify({ prompt:"", completion: " " + obj.prompt + obj.completion})+"\n")
}

readInterface.on('close', function() {
	const resultArray = Object.values(res);
	//console.log(resultArray);
});
