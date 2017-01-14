var im  = require('imagemagick');
var fs  = require('fs');
var aws = require('aws-sdk');
var s3  = new aws.S3({ apiVersion: '2006-03-01' });

var Resizer = function(){};

var getDstKey = function(filename){
  var keyArr = Resizer.s3key.split('/');
  keyArr[keyArr.length - 1] = filename;
  return keyArr.join('/');
};

var putS3Object = function(srcPath, dstKey){
  s3.putObject({
    Bucket: Resizer.bucket,
    Key: dstKey,
    Body: new Buffer(fs.readFileSync(srcPath))
  }, function(err, data){
    if(err){
      console.log(err);
    } else {
      console.log(data);
      console.log('successfully put object to S3.');
    }
  });
};

var trim = function(filepath){
  var options = {
    srcPath: filepath,
    dstPath: Resizer.thumbpath,
    width: Resizer.rectangleWidth,
    height: Resizer.rectangleWidth,
    quality: 1
  };

  im.crop(options, function (err, stdout, stderr){
    if(err){
      throw err.stack || err;
    } else {
      console.log('successfully trimmed image.');

      var dstKey = getDstKey('thumb.jpg');
      putS3Object(Resizer.thumbpath, dstKey);
    }
  });
};

// 画像をレクタングル用にリサイズする
var makeThumnbail = function(filepath){
  var options = {
    srcPath: filepath,
    dstPath: Resizer.tmppath
  };
  if(Resizer.size.aspect <= 1){
    // 横長の場合
    options.height = Resizer.rectangleWidth;
  } else {
    // 縦長の場合
    options.width = Resizer.rectangleWidth;
  }
  im.resize(options, function(err, stdout, stderr){
    if(err){
      throw err;
    } else {
      console.log('successfully resized image.');
      trim(Resizer.tmppath);
    }
  });
};

// Medium画像を生成する
var makeMediumImage = function(filepath){
  var dstKey = getDstKey('medium.jpg');
  if(Resizer.size.x > Resizer.mediumWidth){
    // 横幅が600以上の場合、横幅を基準に縮小
    var options = {
      srcPath: filepath,
      dstPath: Resizer.mediumpath,
      width: Resizer.mediumWidth
    };
    im.resize(options, function(err, stdout, stderr){
      if(err){
        throw err;
      } else {
        console.log('successfully generated medium image.');
        putS3Object(Resizer.mediumpath, dstKey);
      }
    });
  } else {
    // 横幅が600未満の場合、そのままコピー
    var options = {
      Bucket: Resizer.bucket,
      CopySource: Resizer.bucket+'/'+Resizer.s3key,
      Key: dstKey
    }
    s3.copyObject(options, function(err, data) {
      if(err){
        console.log(err, err.stack);
      } else {
        console.log('successfully copied medium image.');
      }
    });
  }
};

exports.handler = function(event, context) {
  Resizer.rectangleWidth = 200;
  Resizer.mediumWidth    = 600;

  Resizer.filepath   = '/tmp/original.jpg';
  Resizer.tmppath    = '/tmp/tmp.jpg';
  Resizer.thumbpath  = '/tmp/thumbnail.jpg';
  Resizer.mediumpath = '/tmp/medium.jpg';

  // S3から渡ってくるバケットの名前の想定
  Resizer.bucket = event.Records[0].s3.bucket.name;
  // 画像ファイル名
  Resizer.s3key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));
  var params = {
    Bucket: Resizer.bucket,
    Key: Resizer.s3key
  };

  console.log('handler init: ', params);

  // S3のファイルを取得してtmpフォルダ内に保存
  s3.getObject(params, function(err, data) {
    event.base64Image = new Buffer(data.Body).toString('base64');
    fs.writeFileSync(Resizer.filepath, new Buffer(event.base64Image, 'base64'));

    console.log('successfully got original.jpg');

    // 縦横を取得する
    im.identify(Resizer.filepath, function(err, features){
      if(err) throw err;

      Resizer.size = {
        x: features.width,
        y: features.height
      };
      Resizer.size.aspect = Resizer.size.y / Resizer.size.x;
      Resizer.size.long   = (Resizer.size.aspect <= 1) ? Resizer.size.x : Resizer.size.y;
      Resizer.size.short  = (Resizer.size.aspect <= 1) ? Resizer.size.y : Resizer.size.x;

      console.log('size: ', Resizer.size);

      makeThumnbail(Resizer.filepath);
      makeMediumImage(Resizer.filepath);
    });
  });
};