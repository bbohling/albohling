const ExifReader = require('exifreader');
const sharp = require('sharp');
const fs = require('fs');
const fse = require('fs-extra');
const fsp = fs.promises;
const path = require('path');
const slugify = require('slugify');
const handlebars = require('handlebars');
const Promise = require('bluebird');

const sketchSource = './content';
// const sourceFolder = './content/sketches'; // todo: refactor
// const assignmentFolder = './content/assignment'; // todo: refactor
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

async function getFileMeta({ filename, sourceFolder }) {
  const imagePath = `${sourceFolder}/${filename}`;
  const tags = await ExifReader.load(imagePath, { includeUnknown: true, expanded: true });
  // const slug = slugify(filename, slugifyOptions);

  const meta = {
    filename,
    createdAt: tags.iptc['Date Created']?.description,
    title: tags.iptc['Object Name']?.description,
    caption: tags.iptc['Caption/Abstract']?.description,
    // slug,
  };

  const slug = slugify(meta?.title || filename, slugifyOptions);
  meta.slug = slug;

  return meta;
}

async function generateSketchImages({ filename, sourceFolder, outputFolder }) {
  console.log(`🖼 create images for: ${filename}`);
  const imagePath = `${sourceFolder}/${filename}`;
  const outputPathThumbs = `${outputFolder}/thumbs`;

  try {
    await fse.ensureDir(outputPathThumbs);
  } catch (error) {
    console.error('Error creating thumbs output path: ', error);
  }

  await Promise.all([
    // create image
    sharp(imagePath)
      .resize({ width: 2000, height: 2000, fit: sharp.fit.inside, background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .toFile(`${outputFolder}/${filename}`)
      .then(() => console.log('...image done')),
    // create thumbnail
    sharp(imagePath)
      .resize({ width: 800, height: 800, fit: sharp.fit.inside, background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .toFile(`${outputPathThumbs}/${filename}`)
      .then(() => console.log('...thumbnail done')),
  ]);
}

async function generateSketchIndex({ sketches, sourceFolder, outputFolder }) {
  const inputFolder = `/templates/${sourceFolder}/index.html`;
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

async function generatePage({ meta, previousSketchMeta, nextSketchMeta, sourceFolder, outputFolder }) {
  const inputFolder = `/templates/${sourceFolder}/page.html`;
  const pageTemplateSource = fs.readFileSync(path.join(__dirname, inputFolder), 'utf8');
  const pageTemplate = handlebars.compile(pageTemplateSource);

  try {
    const html = pageTemplate({
      meta,
      previousSketchMeta,
      nextSketchMeta,
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

function getSketchSourceDirectories(path) {
  return fs
    .readdirSync(path, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((dir) => dir.name);
}

(async () => {
  const timeStart = Date.now();
  // todo: get folder name/path from /content
  const sketchSources = getSketchSourceDirectories(sketchSource);

  await Promise.map(
    sketchSources,
    async (sourceFolder) => {
      // do the things
      const files = await getFileNames(`${sketchSource}/${sourceFolder}`);
      const sketches = [];

      const outputFolder = `${buildFolder}`;
      const outputSketchesFolder = `${outputFolder}/${sourceFolder}`;

      for (const file of files) {
        const fileMeta = await getFileMeta({ filename: file, sourceFolder: `${sketchSource}/${sourceFolder}` });
        sketches.push(fileMeta);
      }

      await Promise.map(
        sketches,
        async (sketchMeta, index) => {
          await generateSketchImages({
            filename: sketchMeta.filename,
            sourceFolder: `${sketchSource}/${sourceFolder}`,
            outputFolder: `${outputSketchesFolder}/images`,
          });
          await generatePage({
            meta: sketchMeta,
            previousSketchMeta: index > 0 ? sketches[index - 1] : null,
            nextSketchMeta: index < sketches.length - 1 ? sketches[index + 1] : null,
            sourceFolder: sourceFolder,
            outputFolder: outputSketchesFolder,
          });
          await generateSketchIndex({ sketches, sourceFolder, outputFolder: outputSketchesFolder });
        },
        { concurrency: 10 }
      );
    },
    { concurrency: 5 }
  );

  await Promise.all([
    // generateSketchIndex({ sketches, sourceFolder, outputFolder: outputSketchesFolder }),
    generateHomepage({ outputFolder: buildFolder }),
    copyAssets(),
  ]);
  const timeEnd = Date.now();
  console.log('🥳 done.');
  console.log(`time: ${(timeEnd - timeStart) / 1000} seconds`);
})();
