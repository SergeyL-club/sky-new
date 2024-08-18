import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { rimraf } from 'rimraf';
import { fileURLToPath } from 'url';

const walk = (dir, done) => {
  var results = [];
  fs.readdir(dir, function (err, list) {
    if (err) return done(err);
    var pending = list.length;
    if (!pending) return done(null, results);
    list.forEach(function (file) {
      file = path.resolve(dir, file);
      fs.stat(file, function (err, stat) {
        if (stat && stat.isDirectory()) {
          walk(file, function (err, res) {
            results = results.concat(res);
            if (!--pending) done(null, results);
          });
        } else {
          results.push(file);
          if (!--pending) done(null, results);
        }
      });
    });
  });
};

const threeDir = async (dir) =>
  new Promise((resolve, reject) => {
    walk(dir, (err, results) => {
      if (err) reject(err);
      let dirname = path.dirname(fileURLToPath(import.meta.url));
      resolve(results.map((pathFile) => path.resolve(dirname, pathFile)));
    });
  });

const buildMain = async () =>
  new Promise(async (resolve) => {
    rimraf('./build').then(async () => {
      await esbuild.build({
        bundle: false,
        entryPoints: await threeDir('./src'),
        outdir: './build',
        write: true,
        legalComments: 'none',
        sourcemap: true,
        target: 'esnext',
        tsconfig: './tsconfig.json',
        loader: {
          '.ts': 'ts',
          '.js': 'js',
        },
        plugins: [
          {
            name: 'import-meta-to-dirname',
            setup(build) {
              build.onLoad({ filter: /\.ts$/ }, async (args) => {
                let source = fs.readFileSync(args.path, 'utf-8');
                source = source.replace(/import\.meta\.url/g, '__filename');
                source = source.replace(/import\.meta\.dirname/g, '__dirname');
                return { contents: source, loader: 'ts' };
              });
            },
          },
        ],
      });
    });
  });

buildMain();
