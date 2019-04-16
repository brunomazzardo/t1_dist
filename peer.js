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
        switch (messageParsed.type) {
            case "request_connection":
                connections.push({files: [...messageParsed.files], owner: remote })
                break;
            case "request_file":
                const ownersList = connections.map(c =>{
                    if(c.files.find(f => f.fileName === messageParsed.fileName) !== void 0)
                        return c.owner
                }).filter(c => c !==null)

                const message  = {
                    type: "file_found",
                    owners: ownersList
                }
                const buffer = new Buffer(JSON.stringify(message))
                server.send(buffer, 0, buffer.length, remote.port, remote.address, function(err, bytes) {
                    if (err) throw err;
                    console.log('UDP message sent to ' + remote.address +':'+ remote.port);
                });

        }
    });
    server.bind(config.port, config.host);
}

function peer(config){


    let filesList = []

    const dir = fs.readdirSync(config.directoryPath)

    dir.forEach(function (file) {
        const fileObject = fs.readFileSync(config.directoryPath + file)
        let fileData = { fileName: file, hash: checksum(fileObject) }
        filesList.push(fileData)
    });


    const request_connection = {
        files : filesList,
        type:"request_connection",
    }

    const buffer  = new Buffer(JSON.stringify(request_connection))
    const client = dgram.createSocket('udp4');
    client.send(buffer, 0, buffer.length, config.port, config.host, function(err, bytes) {
        if (err) throw err;
        console.log('UDP message sent to ' + HOST +':'+ PORT);
        const request_connection = {
            fileName : 'orange.txt',
            type:"request_file",
        }
        const buffer  = new Buffer(JSON.stringify(request_connection))
        client.send(buffer, 0, buffer.length, config.port, config.host, function(err, bytes) {
            if (err) throw err;
            console.log('UDP message sent to ' + HOST +':'+ PORT);
        });
    });


    client.on('message', function (message, remote) {
        let messageParsed = JSON.parse(message)
        switch (messageParsed.type) {
            case "file_found":
                console.log(messageParsed.owners)
        }
    })
}





