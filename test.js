var program = require('commander');
program
  .version('0.0.1');

program
  .command('test [name]')
  .description('test command')
  .action((name, cmd) => {
    console.log('run')
  });

program
  .parse(process.argv);