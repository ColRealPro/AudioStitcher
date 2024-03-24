// Description: Automatically stitches together audio files into 6 minutes and 30 second long audio files with timestamps with a 3 second gap between each audio file.

const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const json2lua = require('json2lua');

const inputPath = path.join(__dirname, 'input'); // Folder of all input audio files
const outputPath = path.join(__dirname, 'output'); // Folder of all output audio files
const ignorePath = path.join(__dirname, 'ignore'); // Folder to ignore

// Create directories if they don't exist
if (!fs.existsSync(inputPath)) fs.mkdirSync(inputPath);
if (!fs.existsSync(outputPath)) fs.mkdirSync(outputPath);
if (!fs.existsSync(ignorePath)) fs.mkdirSync(ignorePath);

let timeinbetween = 1;

ffmpeg()
  .input('anullsrc')
  .inputFormat('lavfi')
  .audioCodec('libopus')
  .outputOptions('-t', `${timeinbetween}`) // duration in seconds
  .save(path.join(ignorePath, 'silence.ogg')); // save to ignore folder

const audioFiles = fs.readdirSync(inputPath).filter((file) => file.endsWith('.ogg')); // Get all audio files in the input folder

const getAudioDurationInSeconds = (audioPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(metadata.format.duration);
    });
  });
};

const stitchAudioFiles = (files, outputFileName) => {
  let command = ffmpeg();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(inputPath, file);

    command = command.input(filePath);
    if (i < files.length - 1) {
      command = command.input(path.join(ignorePath, 'silence.ogg')); // add the silent file
    }
  }

  command
    .on('start', (commandLine) => {
      // console.log('FFmpeg command:', commandLine);
    })
    .on('error', (err) => {
      console.error('An error occurred:', err);
    })
    .on('end', () => {
      console.log('Stitching audio files completed!');
    })
    .mergeToFile(path.join(outputPath, outputFileName), outputPath);
};

let currentStitch = [];
let currentSitchTimestamps = {};
let currentStitchDuration = 0;

setImmediate(async () => {
  let outputIndex = 0;

  while (audioFiles.length > 0) {
    let toRemove = [];
    for (let i = 0; i < audioFiles.length; i++) {
      const audioFile = audioFiles[i];
      const audioFilePath = path.join(inputPath, audioFile);
  
      const audioDuration = await getAudioDurationInSeconds(audioFilePath);
  
      // 390
      if (currentStitchDuration + audioDuration <= 390) {
        currentStitch.push(audioFile);
        currentStitchDuration += audioDuration + 1;

        currentSitchTimestamps[audioFile.split('.')[0]] = {
          startTime: currentStitchDuration - audioDuration - 1,
          endTime: currentStitchDuration - 1
        }

        toRemove.push(i);
      } else {
        console.log('Audio file too long:', audioFile, audioDuration);
      }
    }

    for (let i = toRemove.length - 1; i >= 0; i--) {
      audioFiles.splice(toRemove[i], 1);
    }

    currentStitchDuration = 0;
    ++outputIndex

    await stitchAudioFiles(currentStitch, `output-${outputIndex}.ogg`);
    fs.writeFileSync(path.join(outputPath, `output-${outputIndex}.json`), JSON.stringify(currentSitchTimestamps, null, 2));
    fs.writeFileSync(path.join(outputPath, `output-${outputIndex}.lua`), "return" + json2lua.fromObject(currentSitchTimestamps));

    currentStitch = [];
  }
});