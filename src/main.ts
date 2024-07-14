const main = () =>
  new Promise<number>((resolve, reject) => {
    if (process.argv.length > 10) reject(new Error('Argv length > 10'));

    console.log('Run Program');

    resolve(1);
  });

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(0);
  });
