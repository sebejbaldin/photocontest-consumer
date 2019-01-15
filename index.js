require('dotenv').config();
const rabbitMQ = require('amqplib');
const sharp = require('sharp');
const fs = require('fs');
const request = require('request');
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const config = require('./config');

var download = function (uri, filename, callback) {
      return new Promise(function (resolve, reject) {
            request.head(uri, function (err, res, body) {
                  if (err)
                        reject(err);
                  console.log('content-type:', res.headers['content-type']);
                  console.log('content-length:', res.headers['content-length']);

                  //request(uri).pipe(fs.createWriteStream('uploads/' + filename)).on('close', resolve('immagine salvata'));
                  request({ 
                        uri,
                        encoding: null
                  }, (err, response, body) => {
                        if (err)
                              reject(err);
                        resolve(body);
                  });
            });
      });

};

rabbitMQ.connect(`amqp://${config.rabbit.user}:${config.rabbit.password}@${config.rabbit.host}`)
.then(function (conn) {
      //process.once('SIGINT', function() { conn.close(); });
      return conn.createChannel().then(function (ch) {

            var ok = ch.assertQueue(config.rabbit.queue_name, { durable: false });

            ok = ok.then(function (_qok) {
                  return ch.consume(config.rabbit.queue_name, function (msg) {
                        msg = msg.content.toString() + "";
                        console.log(" [x] Received '%s'", msg);
                        let extension = msg.substring(msg.lastIndexOf('.'));
                        let file_name = msg.substring(msg.lastIndexOf('/') + 1, msg.lastIndexOf('.'))
                        download(msg, `temp${extension}`)
                              .then((buffer) => {
                                    sharp(buffer)
                                          .resize(800, 800, {
                                                fit: 'inside'
                                          })                                                                                    
                                          .jpeg()
                                          .toBuffer()
                                          .then((buffer) => {
                                                uploadToS3(config.aws.bucket_name, file_name + '.jpg', buffer)
                                                .catch(err => console.error(err));
                                          }, (err) => {
                                                console.error(err);
                                          });

                              })
                              .catch(err => console.error(err));
                  }, { noAck: true });
            });

            return ok.then(function (_consumeOk) {
                  console.log(' [*] Waiting for messages. To exit press CTRL+C');
            });
      });
}).catch(console.warn);

async function uploadToS3(bucket_name, file_name, buffer) {
      return new Promise((resolve, reject) => {
            s3.upload({
                  Bucket: bucket_name,
                  Key: 'thumbnails/' + file_name,
                  Body: buffer,
                  ACL: 'public-read'
            }, async (err) => {
                  if (err) {
                        reject(err);
                  }
                  resolve();
            });
      });
}