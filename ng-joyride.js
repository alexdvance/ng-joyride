/**
 * Created by abhik.mitra on 27/06/14.
 * Depends on jQuery, bootstrap's .popover jquery plugin, and angular
 * @TODO: build without jQuery, use ng-popover or foundation's popover
 */


(function(angular) {

    // @TODO: make ui.router dependency conditional
    var drctv = angular.module('ngJoyRide', []);


    drctv.run(['$templateCache', function($templateCache) {
        $templateCache.put('ng-joyride-tplv1.html',
            '<div class=\"popover joyride ng-joyride sharp-borders\">' +
                '<div class=\"arrow\"></div>' +
                '<h3 class=\"popover-title sharp-borders\"></h3>' +
                '<div class=\"popover-content container-fluid\"></div>' +
            '</div>'
        );
        $templateCache.put('ng-joyride-content-tplv1.html',
            '<div class=\"row\">' +
                '<div class=\"joyride--content column medium-12\">' +
                    '<div class=\"joyride--content-scroll\" ng-bind-html=\"content\"></div>' +
                '</div>' +
            '</div>' +
            '<div class=\"row\">' +
                '<div class=\"column medium-12 text-center\">' +
                    '<div class=\"joyride--steps small-4 small-push-4 medium-12 medium-push-0 column\">' +
                        '{{ currentStep }} of {{ totalSteps }}' +
                    '</div>' +
                    '<div class=\"joyride--button-wrapper small-4 medium-12 column\">' +
                        ' <a id=\"nextBtn\" class=\"joyride--button nextBtn button-basic button__primary\" type=\"button\">' +
                            '{{ nextText }}' +
                        '</a>' +
                    '</div>' +
                '</div>' +
            '</div>'
        );
        $templateCache.put('ng-joyride-title-tplv1.html',
            "<div id=\"ng-joyride-title-tplv1\">" +
                "<div class=\"ng-joyride sharp-borders intro-banner\" style=\"\">" +
                    "<div class=\"popover-inner\">" +
                        "<h3 class=\"popover-title sharp-borders\" ng-if=\"heading\">{{heading}}</h3>" +
                        "<div class=\"popover-content container-fluid\">" +
                            "<div ng-bind-html=\"content\"></div>" +
                            "<div class=\"row\">" +
                                "<div class=\"column medium-12 text-center\">" +
                                    "<div class=\"joyride--steps small-4 small-push-4 medium-12 medium-push-0 column\">" +
                                        "{{ currentStep }} of {{ totalSteps }}" +
                                    "</div>" +
                                    "<div class=\"joyride--button-wrapper small-4 medium-12 column\">" +
                                        "<a ng-if=\"!link\" id=\"nextTitleBtn\" class=\"joyride--button nextBtn button-basic button__primary\" type=\"button\">NEXT</a>" +
                                        "<a ng-if=\"link\" ng-click=\"joyrideService.goToLink(link); joyrideService.destroyJoyride();\" id=\"nextTitleBtn\" class=\"joyride--button nextBtn button-basic button__primary\" type=\"button\">GO</a>" +
                                    "</div>" +
                                "</div>" +
                            "</div>" +
                        "</div>" +
                    "</div>" +
                "</div>" +
            "</div>"
        );
    }]);



    //---------------------------------------------------------//
    // Joyride Control Functions
    //---------------------------------------------------------//
    drctv.service('joyrideService', [
        '$http',
        '$timeout',
        '$location',
        '$window',
        '$document',
        '$templateCache',
        '$q',
        '$compile',
        '$sce',
        function($http, $timeout, $location, $window, $document, $templateCache,
                  $q, $compile, $sce) {
        var self = this;

        // Config
        this.config = {};
        this.steps = [];
        this.element = {};
        this.elements = {};
        this.templateUri;
        this.currentStepCount = 0;
        this.firstStepIsElement;
        this.initialized = false;
        this.defaultElementTemplate = 'ng-joyride-tplv1.html';
        this.defaultTitleTemplate = 'ng-joyride-title-tplv1.html';
        this.$curtainEl;
        this.globalHardcodedCurtainClass = 'ng-curtain-class';

        // @TODO: make config option
        this.routeWithUIRouter = true;

        this.setConfig = function(opts) {
            this.config = opts;
            this.totalStepCount = Object.keys(opts).length;
        };

        this.setTemplateUri = function(uri) {
            this.templateUri = uri;
        };

        this.setFirstStepIsElement = function(value) {
            this.firstStepIsElement = value;
        };

        this.addStepElement = function(tour, step, element) {
            if (!this.elements[tour]) {
                this.elements[tour] = {};
            }

            this.elements[tour][step] = element;
        };

        this.firstStepIs = function(step) {
            return this.steps[0].selector === step;
        };

        // @TODO: make this a config option
        this.onFinish = function() {};

        // @TODO: make this a config option
        this.onSkip = function() {};

        // Controls
        this.waitForAngular = function(callback) {
            try {
                var app = angular.element(document.querySelector('body'));
                var $browser = app.injector().get('$browser');

                $browser.notifyWhenNoOutstandingRequests(callback)
            } catch (err) {
                callback(err.message);
            }
        };

        this.goToLink = function(path) {
            $location.path(path);
        };

        this.hasReachedEnd = function() {
            return joyrideService.currentStepCount === (joyrideService.steps.length - 1);
        };

        this.loadTemplate = function(template) {
            if (!template) {
                return '';
            }

            return $q.when($templateCache.get(template)) ||
                        $http.get(template, { cache: true });
        };

        this.goToNext = function(interval) {
            if (!self.hasReachedEnd()) {
                joyrideService.currentStepCount++;
                self.cleanUpPreviousStep();
                $timeout(function() {
                    self.generateStep();
                }, interval || 0);
            } else {
                self.endJoyride();
                joyrideService.onFinish();
            }
        };

        this.endJoyride = function() {
            joyrideService.steps[joyrideService.currentStepCount].cleanUp();
            this.dropCurtain(false);
        };

        this.goToPrev = function(interval) {
            var requires_timeout = false;
            var previousStep;

            // Rollback previous steps until we hit a title or element.
            function rollbackSteps(s, i) {
                s[i].rollback();
            }

            joyrideService.steps[joyrideService.currentStepCount].cleanUp();

            joyrideService.currentStepCount -= 1;

            previousStep = joyrideService.steps[joyrideService.currentStepCount];

            while ((previousStep.type === "location_change" ||
                    previousStep.type === "function") &&
                    joyrideService.currentStepCount >= 1) {
                requires_timeout = true;

                if (previousStep.type === "location_change") {
                    joyrideService.scope.$evalAsync(rollbackSteps(joyrideService.steps, joyrideService.currentStepCount));
                }
                else {
                    previousStep.rollback();
                }
                joyrideService.currentStepCount -= 1;
            }

            requires_timeout = requires_timeout || interval;

            if (requires_timeout) {
                $timeout(self.generateStep, interval || 100);
            }
            else {
                self.generateStep();
            }
        };

        this.skipDemo = function() {
            self.endJoyride();
            joyrideService.onSkip();
        };

        this.dropCurtain = function(shouldDrop) {
            var curtain;

            self.$curtainEl = $('#ng-curtain');

            if (shouldDrop) {
                if (self.$curtainEl.size() === 0) {
                    $('body').append('<div id="ng-curtain" class="' +
                                        joyrideService.globalHardcodedCurtainClass + '"></div>');
                    self.$curtainEl = $('#ng-curtain');
                    self.$curtainEl.slideDown(1000);
                }
            } else {
                self.$curtainEl.slideUp(100, function() {
                    self.$curtainEl.remove();
                });
            }
        };

        this.changeCurtainClass = function(className) {
            self.$curtainEl.removeClass();
            self.$curtainEl.addClass(joyrideService.globalHardcodedCurtainClass);

            if(className) {
                self.$curtainEl.addClass(className);
            }
        };

        this.destroyJoyride = function() {
            joyrideService.steps.forEach(function(elem) {
                elem.cleanUp();
            });
            this.dropCurtain(false);
            joyrideService.element.off('joyride:prev');
            joyrideService.element.off('joyride:next');
            joyrideService.element.off('joyride:exit');
        };

        this.cleanUpPreviousStep = function() {
            if(joyrideService.currentStepCount !== 0) {
                joyrideService.steps[joyrideService.currentStepCount - 1].cleanUp();
            }
        };

        this.generateStep = function() {
            var currentStep = joyrideService.steps[joyrideService.currentStepCount];
            currentStep.generate();
            if (currentStep.type === 'location_change' ||
                currentStep.type === 'function') {
                self.waitForAngular(function() {
                    self.goToNext();
                });
            }
        };
    }]);



    //---------------------------------------------------------//
    // Joyride Init Functions
    //---------------------------------------------------------//
    drctv.service('joyrideInit', [
        'joyrideService',
        'joyrideFn',
        'joyrideTitle',
        'joyrideElement',
        'joyrideLocationChange',
        function(joyrideService, joyrideService, joyrideFn,
                  joyrideTitle, joyrideElement, joyrideLocationChange) {

        function initializeJoyride() {
            var options = {
                config : joyrideService.config,
                templateUri: joyrideService.templateUri
            };
            var count = -1;
            var isFirst = true;
            var disablePrevious;

            angular.forEach(options.config, function(step, stepId) {
                count = step.order - 1;

                switch (step.type) {
                    case "location_change":
                        joyrideService.steps[count] = new joyrideLocationChange(step, count);
                        break;

                    case "element":
                        disablePrevious = isFirst;
                        isFirst = false;

                        joyrideService.steps[count] = new joyrideElement(step, count, step.curtainClass, disablePrevious, step.attachToBody);
                        break;

                    case "title":
                        disablePrevious = isFirst;
                        isFirst = false;
                        joyrideService.steps[count] = new joyrideTitle(step, count, step.curtainClass, disablePrevious);
                        break;

                    case "function":
                        joyrideService.steps[count] = new joyrideFn(step, count, joyrideService.scope.$parent);
                        break;
                }
            });

            // Listen for events
            joyrideService.element.on('joyride:prev', joyrideService.goToPrev);
            joyrideService.element.on('joyride:next', joyrideService.goToNext);
            joyrideService.element.on('joyride:exit', joyrideService.skipDemo);

            joyrideService.setFirstStepIsElement(joyrideService.steps[0].type === 'element');
            joyrideService.initialized = true;
        }

        this.startJoyRide = function(config) {
            if(config) {
                joyrideService.setConfig(config);
            }

            // If directive hasn't been loaded, init when directive loads
            if (!joyrideService.scope || !joyrideService.element) {
                joyrideService.initFromDirective = true;
                return;
            }

            joyrideService.destroyJoyride();
            initializeJoyride();
            joyrideService.currentStepCount = 0;
            joyrideService.dropCurtain(true);
            joyrideService.cleanUpPreviousStep();

            // If step directives haven't loaded, don't generate steps
            if (!joyrideService.firstStepIsElement || !joyrideService.initFromDirective) {
                joyrideService.generateStep();
            }
        };
    }]);



    //---------------------------------------------------------//
    //TYPE = ELEMENT
    //---------------------------------------------------------//
    drctv.factory('joyrideElement', [
        '$timeout',
        '$compile',
        '$sce',
        'joyrideService',
        function($timeout, $compile, $sce, joyrideService) {
        function Element(config, currentStep, curtainClass, shouldDisablePrevious,
                         attachTobody) {
            this.currentStep = currentStep;
            this.content = $sce.trustAsHtml(config.text);
            this.selector = config.selector;
            this.template = config.template || joyrideService.templateUri || joyrideService.defaultElementTemplate;
            this.contentTemplate = 'ng-joyride-content-tplv1.html';
            this.isEnd = this.currentStep + 1 === joyrideService.totalStepCount;

            this.heading = config.heading;
            this.placement = config.placement;
            this.scroll = config.scroll;
            this.staticClass = "ng-joyride-element-static";
            this.nonStaticClass = "ng-joyride-element-non-static";
            this.goToNextFn = joyrideService.goToNextFn;
            this.skipDemoFn = joyrideService.skipDemoFn;
            this.goToPrevFn = joyrideService.goToPrevFn;
            this.addClassToCurtain = joyrideService.changeCurtainClass;
            this.scope = joyrideService.scope;
            this.type = "element";
            this.curtainClass = curtainClass;
            this.shouldDisablePrevious = shouldDisablePrevious;
            this.attachTobody = attachTobody;
            this.shouldNotStopEvent = config.shouldNotStopEvent || false;

            if (config.advanceOn) {
                this.advanceOn = config.advanceOn;
            }
        }

        Element.prototype = (function() {
            var $fkEl;
            // @TODO: make this configurable
            var scrollSpace = 32 + 61;

            function generate() {
                var promise;

                $fkEl = $(this.selector);
                _highlightElement.call(this);
                bindAdvanceOn(this);
                this.addClassToCurtain(this.curtainClass);

                _generateHtml.call(this, self.isEnd)
                                .then(angular.bind(this, _generatePopover))
                                .then(angular.bind(this, _showTooltip));
            }

            function _generateHtml() {
                var self = this;
                var html = {};
                this.scope.heading = this.heading;
                this.scope.content = this.content;

                // Translates from 0-indexed to 1-indexed
                this.scope.currentStep = this.currentStep + 1;

                this.scope.totalSteps = joyrideService.totalStepCount;
                this.scope.link = this.link;
                this.scope.nextText = this.isEnd ? 'FINISH' : 'NEXT';

                return joyrideService.loadTemplate(this.template)
                                    .then(function(html) {
                                        var compiledEl = $compile(html)(self.scope);
                                        self.template = compiledEl;
                                        return compiledEl;
                                    })
                                    .then(function() {
                                        return joyrideService.loadTemplate(self.contentTemplate)
                                    })
                                    .then(function(html) {
                                        var compiledEl = $compile(html)(self.scope);
                                        self.contentTemplate = compiledEl;
                                        return compiledEl;
                                    });
            }

            function _generatePopover(html) {
                $fkEl.popover({
                    title: this.heading,
                    template: this.template,
                    content: this.contentTemplate,
                    html: true,
                    placement: this.placement,
                    trigger: 'manual',
                    container: this.attachTobody ? 'body' : false
                });

                if (this.scroll) {
                    _scrollToElement.call(this, this.selector);
                }
            }

            function _showTooltip() {
                var self = this;
                $fkEl.popover('show');

                // @TODO: do this thru ng-clicks in the generated markup
                $timeout(function() {
                    $('.nextBtn').one("click", joyrideService.goToNext);
                    $('.prevBtn').one("click", joyrideService.goToPrev);
                    $('.skipBtn').one("click", joyrideService.skipDemo);

                    if (self.shouldDisablePrevious) {
                        $('.prevBtn').prop('disabled', true);
                    }
                });
            }

            function stopEvent(event) {
                if(this.shouldNotStopEvent) {
                } else {
                    event.stopPropagation();
                    event.preventDefault();
                }
            }

            function bindAdvanceOn(step) {
                if (step.advanceOn) {
                    return $(step.advanceOn.element).bind(step.advanceOn.event, step.goToNextFn);
                }

                if($fkEl) {
                    return $fkEl.on("click", angular.bind(step,stopEvent));
                }
            }

            function unBindAdvanceOn(step) {
                if (step.advanceOn) {
                    return $(step.advanceOn.element).unbind(step.advanceOn.event, step.goToNextFn);
                }

                if($fkEl) {
                    return $fkEl.off("click", angular.bind(step,stopEvent));
                }
            }

            function _highlightElement() {
                var currentPos = $fkEl.css('position');
                if (currentPos === 'static') {
                    $fkEl.addClass(this.staticClass);
                } else {
                    $fkEl.addClass(this.nonStaticClass);
                }
            }

            function _scrollToElement() {
                $('html, body').animate({
                    scrollTop: $fkEl.offset().top - scrollSpace
                }, 1000);
            }

            function _unhighlightElement() {
                if($fkEl) {
                    $fkEl.removeClass(this.staticClass);
                    $fkEl.removeClass(this.nonStaticClass);
                }
            }

            function cleanUp() {
                _unhighlightElement.call(this);
                if($fkEl) {
                    $fkEl.off("click",angular.bind(this,stopEvent));
                    $($fkEl).popover('destroy');
                }
                unBindAdvanceOn(this);
            }

            return {
                generate: generate,
                cleanUp: cleanUp
            };
        })();


        return Element;
    }]);





    //---------------------------------------------------------//
    //TYPE = TITLE
    //---------------------------------------------------------//
    drctv.factory('joyrideTitle', [
        '$timeout',
        '$compile',
        '$sce',
        'joyrideService',
        function($timeout, $compile, $sce, joyrideService) {

        function Title(config, currentStep, curtainClass, shouldDisablePrevious) {
            this.currentStep = currentStep;
            this.heading = config.heading;
            this.content = $sce.trustAsHtml(config.text);
            this.link = config.link;
            this.titleMainDiv = '<div class="ng-joyride-title"></div>';
            this.titleTemplate = config.titleTemplate || joyrideService.defaultTitleTemplate;
            this.loadTemplateFn = joyrideService.loadTemplate;
            this.hasReachedEndFn = joyrideService.hasReachedEnd;
            this.goToNextFn = joyrideService.goToNext;
            this.skipDemoFn = joyrideService.skipDemo;
            this.goToPrevFn = joyrideService.goToPrev;
            this.addClassToCurtain = joyrideService.changeCurtainClass;
            this.scope = joyrideService.scope;
            this.type = "title";
            this.curtainClass = curtainClass;
            this.shouldDisablePrevious = shouldDisablePrevious;
        }

        Title.prototype = (function() {
            var $fkEl;

            function generateTitle() {
                $fkEl = $(this.titleMainDiv);
                $('body').append($fkEl);
                this.addClassToCurtain(this.curtainClass);

                this.loadTemplateFn(this.titleTemplate)
                        .then(angular.bind(this, _compilePopover))
                        .then(function() {
                            $fkEl.slideDown(100, function() {
                                $('.nextBtn').one("click",function() { self.goToNextFn(200);});
                                $('.skipBtn').one("click",self.skipDemoFn);
                                $('.prevBtn').one("click",function() { self.goToPrevFn(200);});

                                if(self.shouldDisablePrevious) {
                                    $('.prevBtn').prop('disabled', true);
                                }
                            });

                            // scroll to top to make sure popover is visible
                            $('html, body').animate({
                                scrollTop: 0
                            }, 1000);
                        });
            }

            function _compilePopover(html) {
                var self = this;
                this.scope.heading = this.heading;
                this.scope.content = this.content;
                this.scope.link = this.link;

                // Translates from 0-indexed to 1-indexed
                this.scope.currentStep = this.currentStep + 1;

                this.scope.totalSteps = joyrideService.totalStepCount;

                this.scope.joyrideService = joyrideService;

                $fkEl.html($compile(html)(this.scope));
            }

            function cleanUp() {
                if($fkEl) {
                    $fkEl.slideUp(100, function() {
                        $fkEl.remove();
                    });
                }
            }

            return {
                generate: generateTitle,
                cleanUp: cleanUp
            };

        })();

        return Title;
    }]);


    //---------------------------------------------------------//
    //TYPE = JoyRide function
    //---------------------------------------------------------//
    drctv.factory('joyrideFn', [
        '$timeout',
        '$compile',
        '$sce',
        function($timeout, $compile, $sce) {

        function Fn(config, currentStep, parent) {
            this.currentStep = currentStep;

            if(angular.isString(config.fn)) {
                this.func = parent[config.fn];
            } else {
                this.func = config.fn;
            }

            this.type = "function";
        }

        Fn.prototype = (function() {
            function generateFn() {
                this.func(true);
            }

            function cleanUp() {}

            function rollback() {
                this.func(false);
            }

            return {
                generate: generateFn,
                cleanUp: cleanUp,
                rollback: rollback
            };
        })();

        return Fn;
    }]);



    //---------------------------------------------------------//
    //TYPE = Location Change function
    //---------------------------------------------------------//
    drctv.factory('joyrideLocationChange', [
        '$timeout',
        '$compile',
        '$sce',
        '$location',
        function($timeout, $compile, $sce, $location) {

        function LocationChange(config, currentStep) {
            this.path = config.path;
            this.currentStep = currentStep;
            this.prevPath = "";
            this.type = "location_change"
            ;

        }

        LocationChange.prototype = (function() {
            function generateFn() {
                var self = this;
                this.prevPath = $location.path();
                $timeout(function() {
                    $location.path(self.path);
                },0);
            }

            function cleanUp() {}

            function goToPreviousPath() {
                var self = this;
                $timeout(function() {
                    $location.path(self.prevPath);
                });
            }

            return {
                generate: generateFn,
                cleanUp: cleanUp,
                rollback: goToPreviousPath
            };
        })();

        return LocationChange;
    }]);


    //---------------------------------------------------------//
    // JoyRide Directive
    //---------------------------------------------------------//
    drctv.directive('ngJoyRide', [
        'joyrideService',
        'joyrideInit',
        function(joyrideService, joyrideInit) {
        return {
            restrict: "A",
            link: function(scope, element, attrs) {
                joyrideService.scope = scope;
                joyrideService.element = element;
                joyrideService.setTemplateUri(attrs.templateUri);

                if (joyrideService.initFromDirective) {
                    joyrideInit.startJoyRide();
                }
            }
        };
    }]);


    //---------------------------------------------------------//
    // JoyRide Step Directive
    //---------------------------------------------------------//
    drctv.directive('ngJoyRideStep', [
        'joyrideService',
        'joyrideInit',
        function(joyrideService, joyrideInit) {
        return {
            restrict: "AE",
            link: function(scope, element, attrs) {
                var tour = attrs.joyRideName;
                var step = attrs.joyRideStepId;

                joyrideService.addStepElement(tour, step, element);

                if (joyrideService.initFromDirective &&
                    joyrideService.firstStepIs(step)) {
                    joyrideService.generateStep();

                    // reset so return to page doesn't automatically run joyride
                    joyrideService.initFromDirective = false;
                }
            }
        };
    }]);
})(angular);
