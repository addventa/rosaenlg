var assert = require('assert');
var FrenchVerbs = require('../dist/index.js');

const testCasesEtre = [
  ["retomber", true],
  ["naitre", true],
  ["manger", false],
];

describe('french-verbs', function() {
  describe('#alwaysAuxEtre()', function() {
    for (var i=0; i<testCasesEtre.length; i++) {
      const testCase = testCasesEtre[i];
      it(`${testCase[0]}`, function() {
        assert.equal( FrenchVerbs.alwaysAuxEtre(testCase[0]), testCase[1])
      });
    }
  });
});

