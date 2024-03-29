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
    let connections  = [];


    setInterval(()=>{
        let verifyKA = new Date();
        connections = connections.filter(con => {
            console.log((verifyKA - con.lastKeepAlive))
            return (verifyKA - con.lastKeepAlive) < 10000;
        })
        console.log(connections)
    },3000)

    server.on('message', function (message, remote) {
        let messageParsed = JSON.parse(message)
        let buffer = null
        let owners = []
        console.log('received '+ messageParsed.type + ' from' + remote.address +':'+ remote.port)
        switch (messageParsed.type) {
            case "request_connection":
                const remoteOwnerRQ = remote.address + ":" + remote.port;
                let aux = connections.find(con => {
                    const conOwner = con.owner.address + ":" + con.owner.port;
                    return conOwner === remoteOwnerRQ
                })
                if(aux) {
                    aux.lastKeepAlive = new Date();
                } else {
                    connections.push({files: [...messageParsed.content], owner: remote, lastKeepAlive: new Date() })
                }
                break;
            case "keep_alive":
                const remoteOwner = remote.address + ":" + remote.port;
                connections.forEach(con => {
                    const conOwner = con.owner.address + ":" + con.owner.port;
                    if(conOwner === remoteOwner) {
                        con.lastKeepAlive = new Date();
                    }
                })
                break;
            case "request_file":
                //TODO implementar sistema de multicast, hoje ele faz um unicast para cada supernodo que ele conhece :(

                config.other_superPeers.forEach(sp =>{
                    buffer =  buildMessage("request_file_mc",{fileName:messageParsed.content,origin:remote})
                    server.send(buffer, 0, buffer.length, sp.port, sp.ip, function(err, bytes) {
                        if (err) throw err;
                        console.log('UDP message-request_file_mc sent to ' + sp.ip +':'+ sp.port);
                    });
                });
                owners = connections.map(c =>{
                    if(c.files.find(f => f.fileName === messageParsed.content) !== void 0)
                        return c.owner
                }).filter(Boolean)
                buffer = buildMessage("file_found",{owners:owners,fileName:messageParsed.content})
                if(owners.length > 0)
                    server.send(buffer, 0, buffer.length, remote.port, remote.address, function(err, bytes) {
                        if (err) throw err;
                        console.log('UDP message sent to ' + remote.address +':'+ remote.port);
                    });

                break;
            case "request_file_mc":
                 console.log('receive request file mc from' + remote.address +':'+ remote.port)
                 owners = connections.map(c =>{
                    if(c.files.find(f => f.fileName === messageParsed.content.fileName) !== void 0)
                        return c.owner
                }).filter(Boolean)

                buffer  = buildMessage("file_found_mc",{owners:owners,origin:messageParsed.content.origin,fileName:messageParsed.content.fileName})

                server.send(buffer, 0, buffer.length, remote.port, remote.address, function(err, bytes) {
                    if (err) throw err;
                    console.log('UDP message-file_found_mc sent to ' + remote.address +':'+ remote.port);
                });
                break;
            case "file_found_mc":
                buffer  = buildMessage("file_found",{owners:messageParsed.content.owners,fileName:messageParsed.content.fileName})
                if(!!messageParsed.content.owners && messageParsed.content.owners.length > 0)
                    server.send(buffer, 0, buffer.length, messageParsed.content.origin.port, messageParsed.content.origin.address, function(err, bytes) {
                        if (err) throw err;
                        console.log('UDP message-file_found sent to ' + messageParsed.content.origin.address +':'+ messageParsed.content.origin.port);
                    });
                break;
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
    let lastFileRequest = "";

    setInterval(()=> {
        const buffer =  buildMessage("keep_alive")
        client.send(buffer, 0, buffer.length, config.sp_port, config.sp_ip, function(err, bytes) {
            if (err) throw err;
        });
    }, 5000);

    client.on('message', function (message, remote) {
        let messageParsed = JSON.parse(message)
        console.log('received '+ messageParsed.type + ' from' + remote.address +':'+ remote.port)

        switch (messageParsed.type) {
            case "file_found":
                console.log(messageParsed.content)
                if(!!messageParsed.content.owners && messageParsed.content.owners.length > 0) {
                    const buffer = buildMessage("request_file_download", messageParsed.content.fileName)
                    client.send(buffer, 0, buffer.length, messageParsed.content.owners[0].port, messageParsed.content.owners[0].address, function (err, bytes) {
                        if (err) throw err;
                        console.log('UDP message request_file_download sent to ' + messageParsed.content.owners[0].address + ':' + messageParsed.content.owners[0].port);
                    });
                }
                break;
            case "request_file_download":
                const requested_file_hash = files.find(f => f.fileName = messageParsed.content).hash
                const requested_file =  getFileFromDir(config,messageParsed.content)
                const buffer = buildMessage("receive_file",{requested_file:requested_file,request_file_hash:requested_file_hash,fileName:messageParsed.content})
                client.send(buffer, 0, buffer.length,remote.port, remote.address, function (err, bytes) {
                    if (err) throw err;
                    console.log('UDP message request_file_download sent to ' + remote.address + ':' + remote.port);
                });
                break;
            case "receive_file":
                console.log(messageParsed.content)
                console.log('checksum matches:' ,messageParsed.content.request_file_hash === checksum(messageParsed.content.requested_file))
                const checkSumMatches = messageParsed.content.request_file_hash === checksum(messageParsed.content.requested_file)
                if(checkSumMatches)
                    fs.writeFile(config.output_dir+messageParsed.content.fileName,messageParsed.content.requested_file,'utf-8', function(err) {
                        if(err) {
                            return console.log(err);
                        }

                        console.log("The file was saved!");
                    });
        }
    })
    client.bind(config.port, config.ip);
    client.send(buffer, 0, buffer.length, config.sp_port, config.sp_ip, function(err, bytes) {
        if (err) throw err;
        console.log('UDP message sent to ' + config.sp_ip +':'+ config.sp_port);
    });

    stdin.addListener("data", function(d) {
        const input = d.toString().trim().split(" ")
        const action  = input[0]
        let buffer =""
        switch (action) {
            case "rf" :
                lastFileRequest = input[1]
                 buffer  = buildMessage("request_file",lastFileRequest)
                client.send(buffer, 0, buffer.length, config.sp_port, config.sp_ip, function(err, bytes) {
                    if (err) throw err;
                    console.log('UDP message sent to ' + config.sp_ip +':'+ config.sp_port);
                });
                break;
            case "rfl" :
                //TODO mudar para enviar a lista para o método que tem de ser criado no super nodo, não fazer n request de n arquivos
                input[1].split(",").forEach(sr =>{
                    buffer  = buildMessage("request_file",sr)
                        client.send(buffer, 0, buffer.length, config.sp_port, config.sp_ip, function(err, bytes) {
                            if (err) throw err;
                            console.log('UDP message sent to ' + config.sp_ip +':'+ config.sp_port);
                        });
                    })
                break;
        }
    });
}





