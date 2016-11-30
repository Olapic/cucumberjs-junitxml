var xml = require('xml');

/**
 * Creates a <failure> element with an failure message
 *
 * @method createFailure
 * @param message           result.error_message or result.status
 * @returns {Object}        The <failure> element
 */
function createFailure(message) {
    return {
        failure: [
            { _attr: { message: message.split("\n").shift() } },
            message
        ]
    };
}

/**
 * Convert a step from Cucumber.JS into <testcase> XML
 *
 * @method convertStep
 * @param  {Object}    stepJson     Step output from Cucumber.JS
 * @param  {Object}    scenarioJson Scenario output from Cucumber.JS
 * @param  {Object}    options      if `strict` is true, pending or undefined steps will be reported as failures
 * @return {Array}                  Array of elements for an XML element <testcase>
 */
function convertStep (stepJson, scenarioJson, options) {
    var stepOutput = [{
            _attr: {
                name: stepJson.keyword + stepJson.name,
                classname: scenarioJson.id
            }
        }];

    // Convert from nanosecond to seconds
    stepOutput[0]._attr.time = stepJson.result.duration ? (stepJson.result.duration / 1000000000) : 0;

    switch (stepJson.result.status) {
        case 'passed':
            break;
        case 'failed':
            stepOutput.push(createFailure(stepJson.result.error_message));
            break;
        case 'pending':
        case 'undefined':
            if (options.strict) {
                stepOutput.push(createFailure(stepJson.result.status == 'pending' ? 'Pending' :
                    'Undefined step. Implement with the following snippet:\n' +
                    '  this.' + stepJson.keyword.trim() + '(/^' + stepJson.name + '$/, function(callback) {\n' +
                    '      // Write code here that turns the phrase above into concrete actions\n' +
                    '      callback(null, \'pending\');\n' +
                    '  });'
                ));
                break;
            }
        // else fall through
        case 'skipped':
            stepOutput.push({
                skipped: [
                    {
                        _attr: {
                            message: ""
                        }
                    }
                ]
            });
            break;
    }
    return stepOutput;
}


/**
 * Convert a scenario from Cucumber.JS into an XML element <testsuite>
 *
 * @method convertScenario
 * @param  {Object}    scenarioJson Scenario output from Cucumber.JS
 * @param  {Object}    options      if `strict` is true, pending or undefined steps will be reported as failures
 * @return {Array}                  Array of elements for an XML element <testsuite>
 */
function convertScenario (scenarioJson, options) {
    var scenarioOutput = [{
            _attr: {
                name: scenarioJson.name,
                time: 0
            }
        }];
    if(scenarioJson.steps) {
        scenarioJson.steps.forEach(function (stepJson) {
            var step = convertStep(stepJson, scenarioJson, options);
            // Check for errors and increment the failure rate
            if (step[1] && step[1].failure) {
                scenarioOutput.push({ failure: step[1].failure});
            }
            if (step[1] && step[1].skipped) {
                scenarioOutput.push({ skipped: step[1].skipped});
            }
            scenarioOutput[0]._attr.time += step[0]._attr.time;
        });
    }

    return scenarioOutput;
}

/**
 * Skips background steps and calls `convertScenario` each element
 */
function convertFeature(featureJson, options) {
    var featureOutput;
    var elements = featureJson.elements || [];

    elements.forEach(function(featureElement){
        featureOutput = [{
                _attr: {
                    name: featureJson.name,
                    tests: (featureJson.elements) ? featureJson.elements.length : 0,
                    failures: 0,
                    errors: 0,
                    skipped: 0,
                    timestamp: featureElement.mock ? "--" : (new Date()).toUTCString(),
                    time: 0
                }
            }];
            if(featureJson.elements) {
                featureJson.elements.forEach(function (sceanrioJson) {
                    var testcase = convertScenario(featureElement, options);
                    // Check for errors and increment the failure rate
                    if (testcase[1] && testcase[1].failure) {
                        featureOutput[0]._attr.failures += 1;
                    }
                    if (testcase[1] && testcase[1].skipped) {
                        featureOutput[0]._attr.skipped += 1;
                    }
                    featureOutput[0]._attr.time += testcase[0]._attr.time;
                    featureOutput.push({ testcase: testcase });
                });
            }
    });

    //
    return featureOutput;
}

/**
 * options:
 *  - indent - passed to the XML formatter, defaults to 4 spaces
 *  - stream - passed to the XML formatter
 *  - declaration - passed to the XML formatter
 *  - strict - if true, pending or undefined steps will be reported as failures
 *
 * @method exports
 * @param  {string} cucumberRaw  the Cucumber JSON report
 * @param  {object=} options     eg: {indent: boolean, strict: boolean, stream: boolean, declaration: {encoding: 'UTF-8'}}
 * @return {string} the JUnit XML report
 */
function cucumberJunit (cucumberRaw, options) {
    var cucumberJson;
    var output = [];
    options = options || {};
    if (options.indent === undefined) {
        options.indent = '    ';
    }

    if (cucumberRaw && cucumberRaw.toString().trim() !== '') {
        cucumberJson = JSON.parse(cucumberRaw);
        cucumberJson.forEach(function (featureJson) {
            output.push({ testsuite: convertFeature(featureJson, options) });
        });

        // If no items, provide something
        if (output.length === 0) {
            output.push( { testsuite: [] } );
        }
    }

    // wrap all <testsuite> elements in <testsuites> element
    return xml({ testsuites: output }, options);
};

module.exports = cucumberJunit;
