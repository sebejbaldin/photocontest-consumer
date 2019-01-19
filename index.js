require('dotenv').config();
const rabbitMQ = require('amqplib');
const sharp = require('sharp');
const request = require('request');
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const config = require('./config');
const { Pool } = require('pg');
const PgPool = new Pool(config.postgres);

function download(uri) {
      return new Promise((resolve, reject) => {
            request.head(uri, (err, res, body) => {
                  if (err)
                        reject(err);
                  console.log('content-type:', res.headers['content-type']);
                  console.log('content-length:', res.headers['content-length']);

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
      .then((conn) => {
            //process.once('SIGINT', function() { conn.close(); });
            return conn.createChannel()
            .then((ch) => {
                  var ok = ch.assertQueue(config.rabbit.queue_name, { durable: true })
                  .catch(console.warn);
                  ch.prefetch(1);
                  ok = ok.then((_qok) => {
                        return ch.consume(config.rabbit.queue_name, function (message) {
                              let msg = message.content.toString();
                              console.log(" [x] Received '%s'", msg);
                              let extension = msg.substring(msg.lastIndexOf('.'));
                              let file_name = msg.substring(msg.lastIndexOf('/') + 1, msg.lastIndexOf('.'))
                              download(msg)
                                    .then((buffer) => {
                                          return sharp(buffer)
                                                .resize(800, 800, {
                                                      fit: 'fill'
                                                })
                                                .jpeg()
                                                .toBuffer();
                                    }, (err) => {
                                          ch.nack(message);
                                          console.error(err);
                                    })
                                    .then((buffer) => {
                                          return uploadToS3(config.aws.bucket_name, file_name + '.jpg', buffer);
                                    }, (err) => {
                                          ch.nack(message);
                                          console.error(err);
                                    })
                                    .then((file) => {
                                          return makeQuery('UPDATE sebej_pictures SET thumbnail_url = $1 WHERE url = $2',
                                                [GetUri(file), msg]);
                                    }, (err) => {
                                          ch.nack(message);
                                          console.error('Data not uploaded on S3, error: ' + err);
                                    })
                                    .then(() => {
                                          ch.ack(message);
                                    })
                                    .catch((err) => {
                                          ch.nack(message);
                                          console.error('Data not inserted in the database, error: ' + err);
                                    });
                        }, {
                              noAck: false
                        });
                  })
                  .catch(console.warn);

                  return ok.then(function (_consumeOk) {
                        console.log(' [*] Waiting for messages. To exit press CTRL+C');
                  });
            })
            .catch(console.warn);
      })
      .catch(console.warn);

async function uploadToS3(bucket_name, file_name, buffer) {
      file_name = 'thumbnails/' + file_name;
      return new Promise((resolve, reject) => {
            s3.upload({
                  Bucket: bucket_name,
                  Key: file_name,
                  Body: buffer,
                  ACL: 'public-read'
            }, async (err) => {
                  if (err) {
                        reject(err);
                  }
                  resolve(file_name);
            });
      });
}

async function makeQuery(query, values) {
      return new Promise((resolve, reject) => {
            PgPool.connect()
                  .then(client => {
                        if (!values)
                              values = [];
                        client
                              .query(query, values)
                              .then(res => {
                                    client.release();
                                    resolve(res);
                                    //console.log(res.rows[0]);
                              })
                              .catch(e => {
                                    client.release();
                                    reject(e);
                              });
                  })
                  .catch(e => {
                        reject(e);
                  });
      });
}

function GetUri(filename) {
      return encodeURI(process.env.CDN_URL + filename);
}
