import AWS from 'aws-sdk';
import {secrets} from "./Secrets.jsx";

// Configure the AWS SDK with your credentials and region
AWS.config.update({
  // accessKeyId: secrets.publicAccessKey,
  // secretAccessKey: secrets.privateAccessKey,
  region: "us-east-2",
});

const s3 = new AWS.S3();

export default s3;