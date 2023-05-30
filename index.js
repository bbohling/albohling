const ExifReader = require('exifreader');
const sharp = require('sharp');
const fs = require('fs');
const fse = require('fs-extra');
const fsp = fs.promises;
const path = require('path');
const slugify = require('slugify');
const handlebars = require('handlebars');

const sketchFolder = './content/sketches';
const extension = '.jpg';
const buildFolder = './dist';

const templateFolder = `./templates`;
const startTemplateSource = fs.readFileSync(path.join(__dirname, `${templateFolder}/start.html`), 'utf8');
const startTemplate = handlebars.compile(startTemplateSource);
const endTemplateSource = fs.readFileSync(path.join(__dirname, `${templateFolder}/end.html`), 'utf8');
const endTemplate = handlebars.compile(endTemplateSource);

slugify.extend({ jpg: '' });

const slugifyOptions = {
  remove: /jpg/gm,
  lower: true, // convert to lower case, defaults to `false`
  strict: true, // strip special characters except replacement, defaults to `false`
};

async function getFileNames(directory) {
  console.log(directory);
  try {
    const filenames = await fse.readdir(directory);
    const targetFilenames = filenames.filter((file) => {
      return path.extname(file).toLowerCase() === extension;
    });
    return targetFilenames;
  } catch (err) {
    console.error(err);
  }
}

async function getFileMeta(filename) {
  const imagePath = `${sketchFolder}/${filename}`;
  const tags = await ExifReader.load(imagePath, { includeUnknown: true, expanded: true });
  const slug = slugify(filename, slugifyOptions);

  const meta = {
    filename,
    createdAt: tags.iptc['Date Created']?.description,
    title: tags.iptc['Object Name']?.description,
    caption: tags.iptc['Caption/Abstract']?.description,
    slug,
  };

  return meta;
}

async function generateSketchImages({ filename, outputFolder }) {
  console.log(`🖼 create images for: ${filename}`);
  const imagePath = `${sketchFolder}/${filename}`;
  const outputPathThumbs = `${outputFolder}/thumbs`;

  try {
    await fse.ensureDir(outputPathThumbs);
  } catch (error) {
    console.error('Error creating thumbs output path: ', error);
  }

  // create image
  await sharp(imagePath)
    .resize({ width: 2000, height: 2000, fit: sharp.fit.inside, background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .toFile(`${outputFolder}/${filename}`)
    .then(() => console.log('...image done'));

  // create thumbnail
  await sharp(imagePath)
    .resize({ width: 800, height: 800, fit: sharp.fit.inside, background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .toFile(`${outputPathThumbs}/${filename}`)
    .then(() => console.log('...thumbnail done'));
}

async function generateSketchIndex({ sketches, outputFolder }) {
  const inputFolder = '/templates/sketches/index.html';
  const sketchesTemplateSource = fs.readFileSync(path.join(__dirname, inputFolder), 'utf8');
  const template = handlebars.compile(sketchesTemplateSource);

  // create index.html
  try {
    const html = template({
      sketches,
      startTemplate,
      endTemplate,
    });

    fs.mkdirSync(outputFolder, { recursive: true });
    fs.writeFileSync(`${outputFolder}/index.html`, html);
  } catch (error) {
    console.warn('Issue with HTML/Template for Sketches index');
    console.warn(error);
  }
}

async function copyAssets() {
  const assetsFolder = './assets';
  try {
    await fse.copy(assetsFolder, `${buildFolder}/`, { overwrite: true, preserveTimestamps: true });
  } catch (error) {
    console.error(error);
  }
}

async function generatePage({ meta, outputFolder }) {
  const inputFolder = '/templates/sketches/page.html';
  const pageTemplateSource = fs.readFileSync(path.join(__dirname, inputFolder), 'utf8');
  const pageTemplate = handlebars.compile(pageTemplateSource);

  try {
    const html = pageTemplate({
      meta,
      startTemplate,
      endTemplate,
    });

    fs.mkdirSync(outputFolder, { recursive: true });
    fs.writeFileSync(`${outputFolder}/${meta.slug}.html`, html);
  } catch (error) {
    console.warn('Issue with HTML/Template for Sketch page');
    console.warn(error);
  }
}

async function generateHomepage({ outputFolder }) {
  const inputFolder = '/templates/index.html';
  const pageTemplateSource = fs.readFileSync(path.join(__dirname, inputFolder), 'utf8');
  const pageTemplate = handlebars.compile(pageTemplateSource);

  try {
    const html = pageTemplate({
      startTemplate,
      endTemplate,
    });

    fs.mkdirSync(outputFolder, { recursive: true });
    fs.writeFileSync(`${outputFolder}/index.html`, html);
  } catch (error) {
    console.warn('Issue with HTML/Template for Homepage');
    console.warn(error);
  }
}

(async () => {
  const files = await getFileNames(sketchFolder);
  const sketches = [];

  const outputFolder = `${buildFolder}`;
  const outputSketchesFolder = `${outputFolder}/sketches`;

  for (const file of files) {
    const fileMeta = await getFileMeta(file);
    sketches.push(fileMeta);
    await generateSketchImages({ filename: file, outputFolder: `${outputSketchesFolder}/images` });
    await generatePage({ meta: fileMeta, outputFolder: outputSketchesFolder });
  }

  await generateSketchIndex({ sketches, outputFolder: outputSketchesFolder });
  await generateHomepage({ outputFolder });
  await copyAssets();
  console.log('🥳 done.');
})();
