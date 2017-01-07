console.log('Loading event');

exports.handler = function(e, context) {
  console.log(e.Records[0].s3.object.key);
  context.succeed('handler complete');
};