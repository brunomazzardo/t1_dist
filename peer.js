var PORT = 33333;
var HOST = '127.0.0.1';
var fs = require('fs');
var crypto = require('crypto')

var dgram = require('dgram');


start()



function checksum(str, algorithm, encoding) {
    return crypto
        .createHash(algorithm || 'md5')
        .update(str, 'utf8')
        .digest(encoding || 'hex')
}


function start(){
    const config = JSON.parse(fs.readFileSync(`config${process.argv[3]}.json`, 'utf8'));
    if(process.argv[2] === 'sp'){
        superPeer(config)
    }else if (process.argv[2] ==='p'){
        peer(config)
    }
}



function superPeer(config){
    const server = dgram.createSocket('udp4');
    server.on('listening', function () {
        const address = server.address();
        console.log('UDP Server listening on ' + address.address + ":" + address.port);
    });
    const connections  = []


    server.on('message', function (message, remote) {
        let messageParsed = JSON.parse(message)
        let buffer = null
        let owners = []
        console.log('received '+ messageParsed.type + ' from' + remote.address +':'+ remote.port)
        switch (messageParsed.type) {
            case "request_connection":
                connections.push({files: [...messageParsed.content], owner: remote })
                break;
            case "request_file":
                config.other_superPeers.forEach(sp =>{
                    buffer =  buildMessage("request_file_mc",{fileName:messageParsed.content,origin:remote})
                    server.send(buffer, 0, buffer.length, sp.port, sp.ip, function(err, bytes) {
                        if (err) throw err;
                        console.log('UDP message-request_file_mc sent to ' + sp.ip +':'+ sp.port);
                    });
                });

                break;
            case "request_file_mc":
                 console.log('receive request file mc from' + remote.address +':'+ remote.port)
                 owners = connections.map(c =>{
                    if(c.files.find(f => f.fileName === messageParsed.content.fileName) !== void 0)
                        return c.owner
                }).filter(Boolean)

                buffer  = buildMessage("file_found_mc",{owners:owners,origin:messageParsed.content.origin})

                server.send(buffer, 0, buffer.length, remote.port, remote.address, function(err, bytes) {
                    if (err) throw err;
                    console.log('UDP message-file_found_mc sent to ' + remote.address +':'+ remote.port);
                });
                break;
            case "file_found_mc":
                buffer  = buildMessage("file_found",messageParsed.content.owners)

                server.send(buffer, 0, buffer.length, messageParsed.content.origin.port, messageParsed.content.origin.address, function(err, bytes) {
                    if (err) throw err;
                    console.log('UDP message-file_found sent to ' + messageParsed.content.origin.address +':'+ messageParsed.content.origin.port);
                });

        }
    });
    server.bind(config.port, config.ip);
}


function buildMessage(type,content){
    return new Buffer(JSON.stringify( {
        type:type,
        content
    }))
}



function readDir(config){
    let files = []
    const dir = fs.readdirSync(config.directoryPath)
    dir.forEach(function (file) {
        const fileObject = fs.readFileSync(config.directoryPath + file)
        let fileData = { fileName: file, hash: checksum(fileObject) }
        files.push(fileData)
    });
    return files
}



function getFileFromDir(config,fileName){
    const dir = fs.readdirSync(config.directoryPath)
    const filesWithFileName = dir.map(function (file) {
        const fileObject = fs.readFileSync(config.directoryPath + file,'utf-8')
        if(file === fileName)
            return fileObject
    });
    return filesWithFileName[0]
}


function peer(config){
    const stdin = process.openStdin();
    const files = readDir(config)
    const buffer  = buildMessage("request_connection",files)
    const client = dgram.createSocket('udp4');
    let lastFileRequest = ""
    client.on('message', function (message, remote) {
        let messageParsed = JSON.parse(message)
        console.log('received '+ messageParsed.type + ' from' + remote.address +':'+ remote.port)

        switch (messageParsed.type) {
            case "file_found":
                console.log(messageParsed.content)
                if(!!messageParsed.content && messageParsed.content.length > 0) {
                    const buffer = buildMessage("request_file_download", lastFileRequest)
                    client.send(buffer, 0, buffer.length, messageParsed.content[0].port, messageParsed.content[0].ip, function (err, bytes) {
                        if (err) throw err;
                        console.log('UDP message request_file_download sent to ' + messageParsed.content[0].address + ':' + messageParsed.content[0].port);
                    });
                }
                break;
            case "request_file_download":
                const requested_file_hash = files.find(f => f.fileName = messageParsed.content).hash
                const requested_file =  getFileFromDir(config,messageParsed.content)
                const buffer = buildMessage("receive_file",{requested_file:requested_file,request_file_hash:requested_file_hash})
                client.send(buffer, 0, buffer.length,remote.port, remote.address, function (err, bytes) {
                    if (err) throw err;
                    console.log('UDP message request_file_download sent to ' + remote.address + ':' + remote.port);
                });
                break;
            case "receive_file":
                console.log(messageParsed.content)
                console.log('checksum matches:' ,messageParsed.content.request_file_hash === checksum(messageParsed.content.requested_file))

        }
    })
    client.bind(config.port, config.ip);
    client.send(buffer, 0, buffer.length, config.sp_port, config.ip, function(err, bytes) {
        if (err) throw err;
        console.log('UDP message sent to ' + config.ip +':'+ config.sp_port);
    });
    stdin.addListener("data", function(d) {
        const input = d.toString().trim().split(" ")
        const action  = input[0]
        switch (action) {
            case "rf" :
                lastFileRequest = input[1]
                const buffer  = buildMessage("request_file",lastFileRequest)
                client.send(buffer, 0, buffer.length, config.sp_port, config.ip, function(err, bytes) {
                    if (err) throw err;
                    console.log('UDP message sent to ' + config.ip +':'+ config.sp_port);
                });
        }
    });
}





