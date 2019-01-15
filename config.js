module.exports = {
      aws: {            
            bucket_name: process.env.BUCKET_NAME,
            s3_url: process.env.S3_URL
      },
      postgres: {
            user: process.env.PG_USER,
            host: process.env.PG_HOST,
            database: process.env.PG_DATABASE,
            password: process.env.PG_PASSWORD,
            port: process.env.PG_PORT
      },
      rabbit: {
            user: process.env.RABBIT_USER,
            password: process.env.RABBIT_PASSWORD,
            host: process.env.RABBIT_HOST,
            queue_name: process.env.RABBIT_QUEUE
      }
}