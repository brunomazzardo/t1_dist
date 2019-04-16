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
                connections.push({files: [...messageParsed.content], owner: remote })
                break;
            case "request_file":
                const owners = connections.map(c =>{
                    if(c.files.find(f => f.fileName === messageParsed.content) !== void 0)
                        return c.owner
                }).filter(Boolean)

                const buffer  = buildMessage("file_found",owners)

                server.send(buffer, 0, buffer.length, remote.port, remote.address, function(err, bytes) {
                    if (err) throw err;
                    console.log('UDP message sent to ' + remote.address +':'+ remote.port);
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




function peer(config){

    var stdin = process.openStdin();

    let files = []

    const dir = fs.readdirSync(config.directoryPath)

    dir.forEach(function (file) {
        const fileObject = fs.readFileSync(config.directoryPath + file)
        let fileData = { fileName: file, hash: checksum(fileObject) }
        files.push(fileData)
    });



    const buffer  = buildMessage("request_connection",files)

    const client = dgram.createSocket('udp4');

    client.on('message', function (message, remote) {
        let messageParsed = JSON.parse(message)
        switch (messageParsed.type) {
            case "file_found":
                console.log(messageParsed.content)
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
                const buffer  = buildMessage("request_file",input[1])
                client.send(buffer, 0, buffer.length, config.sp_port, config.ip, function(err, bytes) {
                    if (err) throw err;
                    console.log('UDP message sent to ' + config.ip +':'+ config.sp_port);
                });
        }
    });


}





