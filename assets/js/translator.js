/* @flow */

var pairs = {}, chainedPairs = {}, originalPairs = pairs, rawPairs;
var srcLangs = [], dstLangs = [];
var curSrcLang, curDstLang;
var recentSrcLangs = [], recentDstLangs = [];
var droppedFile;
var textTranslateRequest;
var curPaths = [], chosenPath = [];
var svg, simulation, width = 800, height = 550, nodeSize = 20;
var srcLinkPadding = 1.8, dstLinkPadding = 1.8;
var srcNodeX = 0.3, srcNodeY = 0.6, dstNodeX = 0.7, dstNodeY = 0.6;

var UPLOAD_FILE_SIZE_LIMIT = 32E6,
    TRANSLATION_LIST_BUTTONS = 3,
    TRANSLATION_LIST_WIDTH = 650,
    TRANSLATION_LIST_ROWS = 8,
    TRANSLATION_LIST_COLUMNS = 4;

/* exported getPairs */
/* global config, modeEnabled, synchronizeTextareaHeights, persistChoices, getLangByCode, sendEvent, onlyUnique, restoreChoices
    getDynamicLocalization, locale, ajaxSend, ajaxComplete, localizeInterface, filterLangList, cache, readCache, iso639Codes */
/* global SPACE_KEY_CODE, ENTER_KEY_CODE, HTTP_OK_CODE, XHR_LOADING, XHR_DONE, HTTP_OK_CODE, HTTP_BAD_REQUEST_CODE */
/* global $bu_getBrowser */

if(modeEnabled('translation')) {
    $(document).ready(function () {
        synchronizeTextareaHeights();

        function getChainedDstLangs(srcLang) {
            var targets = [];
            var targetsSeen = {};
            targetsSeen[srcLang] = true;
            var targetLists = [pairs[srcLang]];

            while(targetLists.length > 0) {
                $.each(targetLists.pop(), function (i, trgt) {
                    if(!targetsSeen[trgt]) {
                        targets.push(trgt);
                        if(pairs[trgt]) {
                            targetLists.push(pairs[trgt]);
                        }
                        targetsSeen[trgt] = true;
                    }
                });
            }

            return targets;
        }

        if(config.TRANSLATION_CHAINING) {
            $('.chaining').show();
            $.each(pairs, function (srcLang, _dstLangs) {
                chainedPairs[srcLang] = getChainedDstLangs(srcLang);
            });
            updatePairList();
            populateTranslationList();
        }

        $('#srcLanguages').on('click', '.languageName:not(.text-muted)', function () {
            curSrcLang = $(this).attr('data-code');
            handleNewCurrentLang(curSrcLang, recentSrcLangs, 'srcLang');

            autoSelectDstLang();
            refreshChainGraph();
        });

        $('#dstLanguages').on('click', '.languageName:not(.text-muted)', function () {
            curDstLang = $(this).attr('data-code');
            handleNewCurrentLang(curDstLang, recentDstLangs, 'dstLang');
            refreshChainGraph();
        });

        $('.srcLang').click(function () {
            curSrcLang = $(this).attr('data-code');
            $('.srcLang').removeClass('active');
            $(this).addClass('active');
            populateTranslationList();
            refreshLangList(true);
            refreshChainGraph();
            muteLanguages();
            localizeInterface();
            translateText();

            autoSelectDstLang();
        });

        $('.dstLang').click(function () {
            curDstLang = $(this).attr('data-code');
            $('.dstLang').removeClass('active');
            $(this).addClass('active');
            refreshLangList();
            refreshChainGraph();
            muteLanguages();
            localizeInterface();
            translateText();
        });

        $('button#translate').click(function () {
            translate();
            persistChoices('translator', true);
        });

        $('input#chainedTranslation').change(function () {
            updatePairList();
            populateTranslationList();
            persistChoices('translator');
            $('#chooseChain').toggleClass('hide', !$('#chainedTranslation').prop('checked'));
        });

        var timer,
            // eslint-disable-next-line no-magic-numbers
            lastPunct = false, punct = [46, 33, 58, 63, 47, 45, 190, 171, 49],
            timeoutPunct = 1000, timeoutOther = 3000;
        $('#originalText').on('keyup paste', function (event) {
            if(lastPunct && (event.keyCode === SPACE_KEY_CODE || event.keyCode === ENTER_KEY_CODE)) {
                // Don't override the short timeout for simple space-after-punctuation
                return;
            }

            if(timer && $('#instantTranslation').prop('checked')) {
                clearTimeout(timer);
            }

            var timeout;
            if(punct.indexOf(event.keyCode) !== -1) {
                timeout = timeoutPunct;
                lastPunct = true;
            }
            else {
                timeout = timeoutOther;
                lastPunct = false;
            }

            timer = setTimeout(function () {
                if($('#instantTranslation').prop('checked')) {
                    translateText();
                }
                persistChoices('translator', true);
            }, timeout);

            synchronizeTextareaHeights();
        });

        $(window).resize(synchronizeTextareaHeights);

        $('#originalText').blur(function () {
            persistChoices('translator', true);
        });

        $('#instantTranslation').change(function () {
            persistChoices('translator');
        });

        $('#markUnknown').change(function () {
            if($('div#translateText').is(':visible')) {
                translateText();
            }
            persistChoices('translator');
        });

        $('#originalText').on('input propertychange', function () {
            persistChoices('translator');
        });

        $('#originalText').submit(function () {
            translateText();
        });

        $('.clearButton').click(function () {
            $('#originalText, #translatedText').val('');
            $('#originalText').focus();
            synchronizeTextareaHeights();
        });

        $('#detect').click(function () {
            $('.srcLang').removeClass('active');
            $(this).addClass('active');
            detectLanguage();
            translateText();
        });

        $('.swapLangBtn').click(function () {
            var srcCode = $('.srcLang.active').attr('data-code'), dstCode = $('.dstLang.active').attr('data-code');
            curSrcLang = dstCode;
            curDstLang = srcCode;

            if(recentSrcLangs.indexOf(curSrcLang) !== -1) {
                $('.srcLang').removeClass('active');
                $('#srcLang' + (recentSrcLangs.indexOf(curSrcLang) + 1)).addClass('active');
                $('#srcLangSelect').val(curSrcLang);
            }
            else {
                recentSrcLangs[recentSrcLangs.indexOf(srcCode)] = curSrcLang;
            }

            if(recentDstLangs.indexOf(curDstLang) !== -1) {
                $('.dstLang').removeClass('active');
                $('#dstLang' + (recentDstLangs.indexOf(curDstLang) + 1)).addClass('active');
                $('#dstLangSelect').val(curDstLang);
            }
            else {
                recentDstLangs[recentDstLangs.indexOf(dstCode)] = curDstLang;
            }

            refreshLangList(true);
            muteLanguages();

            if($('.active > #detectedText')) {
                $('.srcLang').removeClass('active');
                $('#srcLang' + (recentSrcLangs.indexOf(curSrcLang) + 1)).addClass('active');
            }
        });

        $('#srcLangSelect').change(function () {
            var selectValue = $(this).val();
            if(selectValue === 'detect') {
                detectLanguage();
                translateText();
            }
            else {
                handleNewCurrentLang(curSrcLang = $(this).val(), recentSrcLangs, 'srcLang', true);
            }
        });

        $('#dstLangSelect').change(function () {
            handleNewCurrentLang(curDstLang = $(this).val(), recentDstLangs, 'dstLang', true);
        });

        $('button#translateDoc').click(function () {
            $('div#translateText').fadeOut('fast', function () {
                $('#fileInput').show();
                $('div#fileName').hide();
                $('div#docTranslation').fadeIn('fast');
            });
            pairs = originalPairs;
            populateTranslationList();
        });

        $('button#cancelDocTranslate').click(function () {
            droppedFile = undefined;
            $('div#docTranslation').fadeOut('fast', function () {
                $('a#fileDownload').hide();
                $('span#uploadError').hide();
                $('div#translateText').fadeIn('fast', synchronizeTextareaHeights);
                $('input#fileInput').wrap('<form>').closest('form')[0].reset();
                $('input#fileInput').unwrap();
            });
            updatePairList();
            populateTranslationList();
        });

        $('input#fileInput').change(function () {
            $('div#fileUploadProgress').parent().fadeOut('fast', function () {
                $('span#uploadError').fadeOut('fast');
            });
            $('a#fileDownload').fadeOut('fast');
        });

        $('body').on('dragover', function (ev) {
            ev.preventDefault();
            return false;
        });
        $('body').on('dragenter', function (ev) {
            ev.preventDefault();
            if(!$('div#fileDropBackdrop:visible').length) {
                $('div#fileDropBackdrop').fadeTo('fast', 0.5);
                $('div#fileDropMask').on('drop', function (ev) {
                    ev.preventDefault();
                    droppedFile = ev.originalEvent.dataTransfer.files[0];

                    $('#fileDropBackdrop').fadeOut();
                    if(!$('div#docTranslation').is(':visible')) {
                        $('div#translateText').fadeOut('fast', function () {
                            $('input#fileInput').hide();
                            $('div#docTranslation').fadeIn('fast');

                            if(droppedFile) {
                                $('div#fileName').show().text(droppedFile.name);
                                translateDoc();
                            }
                        });
                    }
                    else {
                        $('input#fileInput').fadeOut('fast', function () {
                            if(droppedFile) {
                                $('div#fileName').show().text(droppedFile.name);
                                translateDoc();
                            }
                        });
                    }

                    return false;
                });
                $('div#fileDropMask').on('dragleave', function () {
                    $('div#fileDropBackdrop').fadeOut();
                });
            }
            return false;
        });

        initChainGraph();
    });
}

function initChainGraph() {
    var choose = d3.select('#chooseModalBody');
    svg = choose
        .append('svg')
        .attr('width', width.toString() + 'px')
        .attr('height', height.toString() + 'px');
    var rect = d3.select('svg').node().getBoundingClientRect();
    choose.append('br');
    choose.append('b').text('Valid Paths:');
    choose.append('div').attr('id', 'validPaths');

    /* eslint-disable no-magic-numbers */
    svg.append('svg:defs').append('svg:marker')
        .attr('id', 'end-arrow')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 6)
        .attr('markerWidth', 3)
        .attr('markerHeight', 3)
        .attr('orient', 'auto')
      .append('svg:path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', '#999');

    svg.append('svg:defs').append('svg:marker')
        .attr('id', 'start-arrow')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 4)
        .attr('markerWidth', 3)
        .attr('markerHeight', 3)
        .attr('orient', 'auto')
      .append('svg:path')
        .attr('d', 'M10,-5L0,0L10,5')
        .attr('fill', '#999');

    simulation = d3.forceSimulation()
        .force('link', d3.forceLink().id(function (d) { return d.id; }).distance(nodeSize * 10))
        .force('charge', d3.forceManyBody().strength(-700))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .alphaDecay(0.018);
    /* eslint-enable no-magic-numbers */

    refreshChainGraph();
}

function boundary(dist, max) {
    if(dist < nodeSize) return nodeSize;
    if(dist < max - nodeSize) return dist;
    return max - nodeSize;
}

function clone(obj) {
    if(null == obj || 'object' != typeof obj) return obj;
    var copy = obj.constructor();
    for(var attr in obj) {
        if(obj.hasOwnProperty(attr)) copy[attr] = clone(obj[attr]);
    }
    return copy;
}

function paths(src, trgt, curPath, seens) {
    if(!originalPairs[src]) return [];
    var rets = [];
    for(var i = 0; i < originalPairs[src].length; i++) {
        var lang = originalPairs[src][i];
        var newPath = curPath.slice();
        newPath.push(lang);
        var oldSeens = clone(seens);
        if(lang === trgt) rets.push(newPath);
        else if(!(lang in seens)) {
            seens[lang] = [];
            var recurse = paths(lang, trgt, newPath, seens);
            for(var j = 0; j < recurse.length; j++) {
                rets.push(recurse[j]);
                seens[lang].push(recurse[j].slice(recurse[j].indexOf(lang)));
            }
        }
        else {
            for(var j = 0; j < seens[lang].length; j++) {
                rets.push(newPath.concat(seens[lang][j]));
            }
        }
        seens = oldSeens;
    }
    return rets;
}

function displayPaths(paths) {
    var graph = {};
    var nodes = [];
    var ids = [];
    var source = paths[0][0];
    var target = paths[0][paths[0].length - 1];
    for(var i = 0; i < paths.length; i++) {
        for(var j = 0; j < paths[i].length; j++) {
            var lang = paths[i][j];
            if(ids.indexOf(lang) === -1) {
                if(lang === source) nodes.push({'id': lang, 'fx': srcNodeX * width, 'fy': srcNodeY * height});
                else if(lang === target) nodes.push({'id': lang, 'fx': dstNodeX * width, 'fy': dstNodeY * height});
                else nodes.push({'id': lang});
                ids.push(lang);
            }
        }
    }

    function backForth(src, trgt) {
        return (((src in originalPairs) ? (originalPairs[src].indexOf(trgt) !== -1) : true) && ((trgt in originalPairs) ? (originalPairs[trgt].indexOf(src) !== -1) : true));
    }

    graph.nodes = nodes;
    graph.links = rawPairs.slice();
    var bfs = [];
    var i = 0;
    while(i < graph.links.length) {
        var src = graph.links[i].sourceLanguage;
        var trgt = graph.links[i].targetLanguage;
        if((ids.indexOf(src) !== -1) && (ids.indexOf(trgt) !== -1)) {
            if(backForth(src, trgt)) {
                if((bfs.indexOf(src + trgt) === -1) && (bfs.indexOf(trgt + src) === -1)) {
                    bfs.push(src + trgt);
                    graph.links[i] = {'source': src, 'target': trgt, 'right': true, 'left': true};
                    i++;
                }
                else graph.links.splice(i, 1);
            }
            else {
                graph.links[i] = {'source': src, 'target': trgt, 'right': true};
                i++;
            }
        }
        else graph.links.splice(i, 1);
    }

    var link = svg.append('g')
        .attr('class', 'links')
      .selectAll('path')
      .data(graph.links)
      .enter()
      .append('path')
      .style('marker-start', function (d) { return d.left ? 'url(#start-arrow)' : ''; })
      .style('marker-end', function (d) { return d.right ? 'url(#end-arrow)' : ''; })
      .attr('id', function (d) { return d.source + '-' + d.target; })
      .classed('some_path', false)
      .classed('all_path', false);

    var node = svg.append('g')
        .attr('class', 'nodes')
      .selectAll('g')
      .data(graph.nodes)
      .enter()
      .append('g');

    var circ = node.append('circle');
    circ
        .attr('r', nodeSize)
        .attr('id', function (d) { return d.id; })
        .classed('endpoint', function (d) { return (d.id === source || d.id === target); })
        .call(d3.drag()
            .on('start', dragStarted)
            .on('drag', dragged)
            .on('end', dragEnded))
        .on('click', nodeClicked)
        .append('title')
            .text(function (d) { return d.id; });
    node
        .append('text')
        .attr('class', 'langs')
        .attr('dy', nodeSize / 2 - 5)
        .text(function (d) { return d.id; });

    simulation
        .nodes(graph.nodes)
        .on('tick', ticked);

    simulation
        .force('link')
        .links(graph.links);

    var text = node.selectAll('text');
    function ticked() {
        circ
            .attr('cx', function (d) {
                d.x = boundary(d.x, width);
                d.y = boundary(d.y, height);
                return d.x;
            })
            .attr('cy', function (d) { return d.y; });
        text
            .attr('x', function (d) { return boundary(d.x, width); })
            .attr('y', function (d) { return boundary(d.y, height); });
        link.attr('d', function (d) {
            var srcx = boundary(d.source.x, width),
                srcy = boundary(d.source.y, height),
                trgtx = boundary(d.target.x, width),
                trgty = boundary(d.target.y, height);
            var deltaX = trgtx - srcx,
                deltaY = trgty - srcy,
                dist = Math.sqrt((deltaX * deltaX) + (deltaY * deltaY)),
                normX = deltaX / dist,
                normY = deltaY / dist,
                sourcePadding = nodeSize * srcLinkPadding,
                targetPadding = nodeSize * dstLinkPadding,
                sourceX = srcx + (sourcePadding * normX),
                sourceY = srcy + (sourcePadding * normY),
                targetX = trgtx - (targetPadding * normX),
                targetY = trgty - (targetPadding * normY);
            return 'M' + sourceX + ',' + sourceY + 'L' + targetX + ',' + targetY;
        });
    }
}

function refreshChainGraph() {
    d3.selectAll('svg > g').remove();
    d3.selectAll('#validPaths > a').remove();
    chosenPath = [curSrcLang, curDstLang];
    var tmpSeens = {};
    tmpSeens[curSrcLang] = [];
    curPaths = paths(curSrcLang, curDstLang, [curSrcLang], tmpSeens);
    displayPaths(curPaths);
    simulation.alpha(1).restart();
    d3.select('.endpoint').dispatch('click');
}

function dragStarted(d) {
    // eslint-disable-next-line no-magic-numbers
    if(!d3.event.active) simulation.alphaTarget(0.3).restart();
    d3.select(this).classed('dragging', true);
    d.fx = boundary(d.x, width);
    d.fy = boundary(d.y, height);
}

function dragged(d) {
    d.fx = d3.event.x;
    d.fy = d3.event.y;
}

function dragEnded(d) {
    if(!d3.event.active) simulation.alphaTarget(0);
    d3.select(this).classed('dragging', false);
    if(!d3.select(this).classed('endpoint')) {
        d.fx = null;
        d.fy = null;
    }
}

function nodeClicked() {
    var curSel = !d3.select(this).classed('selected');
    d3.select(this).classed('selected', curSel);
    d3.selectAll('path').classed('some_path', false);
    d3.selectAll('path').classed('all_path', false);
    d3.selectAll('#validPaths > a').remove();

    var highPaths = [];
    curPaths.forEach(function (d) {
        var some = false, all = true;
        for(var i = 1; i < d.length - 1; i++) {
            if(d3.select('#' + d[i]).classed('selected')) some = true;
            else all = false;
        }
        highPaths.push({'path': d, 'some': some, 'all': all});
    });
    highPaths.forEach(function (d) {
        var path = d.path;
        if(d.some) {
            for(var i = 0; i < path.length - 1; i++) {
                d3.select('#' + path[i] + '-' + path[i + 1]).classed('some_path', d.some);
                d3.select('#' + path[i + 1] + '-' + path[i]).classed('some_path', d.some);
            }
        }
        if(d.all) {
            for(i = 0; i < path.length - 1; i++) {
                d3.select('#' + path[i] + '-' + path[i + 1]).classed('all_path', d.all);
                d3.select('#' + path[i + 1] + '-' + path[i]).classed('all_path', d.all);
            }
            if(d.path.length > d3.selectAll('.selected').size() - 1) {
                d3.select('#validPaths')
                    .append('a')
                    .attr('data-dismiss', 'modal')
                    .text(d.path.join(' → '))
                    .on('click', function (a, b, validPath) {
                        chosenPath = validPath[0].text.split(' → ');
                    });
            }
        }
    });
}

/*
function onClear(d) {
    d3.selectAll('circle').classed('selected', false);
    d3.selectAll('path').classed('some_path', false);
    d3.selectAll('path').classed('all_path', false);
}
*/

function getPairs() {
    var deferred = $.Deferred();

    if(config.PAIRS && 'responseData' in config.PAIRS) {
        handlePairs(config.PAIRS.responseData);
        deferred.resolve();
    }
    else {
        var pairData = readCache('pairs', 'LIST_REQUEST');
        if(pairData) {
            handlePairs(pairData);
            deferred.resolve();
        }
        else {
            console.warn('Translation pairs cache ' + (pairs === null ? 'stale' : 'miss') + ', retrieving from server');
            $.jsonp({
                url: config.APY_URL + '/list?q=pairs',
                beforeSend: ajaxSend,
                success: function (data) {
                    handlePairs(data.responseData);
                    cache('pairs', data.responseData);
                },
                error: function () {
                    console.error('Failed to get available translation language pairs');
                    translationNotAvailable();
                },
                complete: function () {
                    ajaxComplete();
                    deferred.resolve();
                }
            });
        }
    }

    function handlePairs(pairData) {
        rawPairs = pairData;
        if(!pairData) {
            populateTranslationList();
            restoreChoices('translator');
            translate();
            return;
        }
        $.each(pairData, function (i, pair) {
            if(config.ALLOWED_PAIRS && config.ALLOWED_PAIRS.indexOf(pair.sourceLanguage + '-' + pair.targetLanguage) === -1) {
                return;
            }
            srcLangs.push(pair.sourceLanguage);
            dstLangs.push(pair.targetLanguage);

            if(pairs[pair.sourceLanguage]) {
                pairs[pair.sourceLanguage].push(pair.targetLanguage);
            }
            else {
                pairs[pair.sourceLanguage] = [pair.targetLanguage];
            }
        });
        srcLangs = filterLangList(srcLangs.filter(onlyUnique));
        dstLangs = filterLangList(dstLangs.filter(onlyUnique));

        for(var k in pairs) {
            // Default for new users is first available pair; TODO something smart based on browser lang setting
            curSrcLang = k;
            curDstLang = pairs[k][0];
            break;
        }
        for(var i = 0; i < TRANSLATION_LIST_BUTTONS; i++) {
            recentSrcLangs.push(i < srcLangs.length ? srcLangs[i] : undefined);
            recentDstLangs.push(i < dstLangs.length ? dstLangs[i] : undefined);
        }

        populateTranslationList();
        restoreChoices('translator');
        translate();
    }

    return deferred.promise();
}

function handleNewCurrentLang(lang, recentLangs, langType, resetDetect, noTranslate) {
    $('.' + langType).removeClass('active');
    if(recentLangs.indexOf(lang) === -1) {
        recentLangs.unshift(lang);
        $('#' + langType + '1').addClass('active');
        refreshLangList(resetDetect);
    }
    else {
        $('#' + langType + (recentLangs.indexOf(lang) + 1)).addClass('active');
        persistChoices('translator');
    }

    $('select#' + langType + 'Select').val(lang);
    if(resetDetect && recentLangs.indexOf(lang) !== -1) {
        refreshLangList(resetDetect);
    }

    populateTranslationList();
    muteLanguages();
    localizeInterface();
    if(!noTranslate) {
        translateText();
    }
}

function refreshLangList(resetDetect) {
    recentSrcLangs = filterLangs(recentSrcLangs, srcLangs);
    recentDstLangs = filterLangs(recentDstLangs, dstLangs);

    persistChoices('translator');

    for(var i = 0; i < TRANSLATION_LIST_BUTTONS; i++) {
        var srcBtn = $('#srcLang' + (i + 1));
        var dstBtn = $('#dstLang' + (i + 1));
        if(i < recentSrcLangs.length && recentSrcLangs[i]) {
            srcBtn.show().attr('data-code', recentSrcLangs[i]).text(getLangByCode(recentSrcLangs[i]));
        }
        else {
            srcBtn.hide();
        }
        if(i < recentDstLangs.length && recentDstLangs[i]) {
            dstBtn.show().attr('data-code', recentDstLangs[i]).text(getLangByCode(recentDstLangs[i]));
        }
        else {
            dstBtn.hide();
        }
    }

    if($('#detectedText').parent('.srcLang').attr('data-code')) {
        $('#detectedText')
            .text(getLangByCode($('#detectedText')
            .parent('.srcLang')
            .attr('data-code')) + ' - ' + getDynamicLocalization('detected'));
    }

    if(resetDetect) {
        $('#detectText').show();
        $('#detectedText').hide();
    }

    function filterLangs(recentLangs, allLangs) {
        recentLangs = recentLangs.filter(onlyUnique);
        if(recentLangs.length < TRANSLATION_LIST_BUTTONS) {
            for(var i = 0; i < allLangs.length; i++) {
                if(recentLangs.length < TRANSLATION_LIST_BUTTONS && recentLangs.indexOf(allLangs[i]) === -1) {
                    recentLangs.push(allLangs[i]);
                }
            }
        }
        if(recentLangs.length > TRANSLATION_LIST_BUTTONS) {
            recentLangs = recentLangs.slice(0, TRANSLATION_LIST_BUTTONS);
        }
        return recentLangs;
    }
}

function updatePairList() {
    pairs = $('input#chainedTranslation').prop('checked') ? chainedPairs : originalPairs;
}

function populateTranslationList() {
    sortTranslationList();
    $('.languageName').remove();
    $('.languageCol').show().removeClass('col-sm-3 col-sm-4 col-sm-6 col-sm-12');

    var numSrcCols = Math.ceil(srcLangs.length / TRANSLATION_LIST_ROWS) < (TRANSLATION_LIST_COLUMNS + 1)
            ? Math.ceil(srcLangs.length / TRANSLATION_LIST_ROWS)
            : TRANSLATION_LIST_COLUMNS,
        numDstCols = Math.ceil(dstLangs.length / TRANSLATION_LIST_ROWS) < (TRANSLATION_LIST_COLUMNS + 1)
            ? Math.ceil(dstLangs.length / TRANSLATION_LIST_ROWS)
            : TRANSLATION_LIST_COLUMNS;
    var srcLangsPerCol = Math.ceil(srcLangs.length / numSrcCols),
        dstLangsPerCol = Math.ceil(dstLangs.length / numDstCols);

    var BOOTSTRAP_MAX_COLUMNS = 12;

    $('#srcLanguages').css('min-width', Math.floor(TRANSLATION_LIST_WIDTH * (numSrcCols / TRANSLATION_LIST_COLUMNS)) + 'px');
    $('#srcLanguages .languageCol').addClass('col-sm-' + (BOOTSTRAP_MAX_COLUMNS / numSrcCols));
    $('#srcLanguages .languageCol:gt(' + (numSrcCols - 1) + ')').hide();

    $('#dstLanguages').css('min-width', Math.floor(TRANSLATION_LIST_WIDTH * (numDstCols / TRANSLATION_LIST_COLUMNS)) + 'px');
    $('#dstLanguages .languageCol').addClass('col-sm-' + (BOOTSTRAP_MAX_COLUMNS / numDstCols));
    $('#dstLanguages .languageCol:gt(' + (numDstCols - 1) + ')').hide();

    for(var i = 0; i < numSrcCols; i++) {
        var numSrcLang = Math.ceil(srcLangs.length / numSrcCols) * i;
        for(var j = numSrcLang; j < numSrcLang + srcLangsPerCol; j++) {
            if(numSrcLang < srcLangs.length) {
                var langCode = srcLangs[j], langName = getLangByCode(langCode);
                $('#srcLanguages .languageCol:eq(' + i + ')')
                    .append($('<div class="languageName"></div>')
                    .attr('data-code', langCode)
                    .text(langName));
            }
        }
    }

    for(i = 0; i < numDstCols; i++) {
        var numDstLang = Math.ceil(dstLangs.length / numDstCols) * i;
        for(j = numDstLang; j < numDstLang + dstLangsPerCol; j++) {
            if(numDstLang < dstLangs.length) {
                langCode = dstLangs[j], langName = getLangByCode(langCode);
                $('#dstLanguages .languageCol:eq(' + i + ')')
                    .append($('<div class="languageName"></div>')
                    .attr('data-code', langCode)
                    .text(langName));
            }
        }
    }

    $('.langSelect option[value!=detect]').remove();
    $.each(srcLangs, function () {
        $('#srcLangSelect').append($('<option></option>').prop('value', this).text(getLangByCode(this)));
    });
    $.each(dstLangs, function () {
        $('#dstLangSelect').append($('<option></option>').prop('value', this).text(getLangByCode(this)));
    });

    $('#srcLangSelect').val(curSrcLang);
    $('#dstLangSelect').val(curDstLang);

    muteLanguages();

    if(srcLangs.length === 1) {
        $('#srcLangSelectors div.btn-group').hide();
    }
    if(dstLangs.length === 1) {
        $('#dstLangSelectors div.btn-group').hide();
    }

    function sortTranslationList() {
        var sortLocale = (locale && locale in iso639Codes) ? iso639Codes[locale] : locale;

        srcLangs = srcLangs.sort(function (a, b) {
            try {
                return getLangByCode(a).localeCompare(getLangByCode(b), sortLocale);
            }
            catch(e) {
                return getLangByCode(a).localeCompare(getLangByCode(b));
            }
        });

        dstLangs = dstLangs.sort(function (a, b) {
            var aPossible = pairs[curSrcLang] && pairs[curSrcLang].indexOf(a) !== -1,
                bPossible = pairs[curSrcLang] && pairs[curSrcLang].indexOf(b) !== -1;

            if((aPossible && bPossible) || (!aPossible && !bPossible)) {
                try {
                    return getLangByCode(a).localeCompare(getLangByCode(b), sortLocale);
                }
                catch(e) {
                    return getLangByCode(a).localeCompare(getLangByCode(b));
                }

            }
            else if(aPossible && !bPossible) {
                return -1;
            }
            else {
                return 1;
            }
        });
    }
}

function translate() {
    if($('div#translateText').is(':visible')) {
        translateText();
    }
    else {
        translateDoc();
    }
}

function translateText() {
    if($('div#translateText').is(':visible')) {
        if(pairs[curSrcLang] && pairs[curSrcLang].indexOf(curDstLang) !== -1) {
            sendEvent('translator', 'translate', curSrcLang + '-' + curDstLang, $('#originalText').val().length);
            if(textTranslateRequest) {
                textTranslateRequest.abort();
            }
            var endpoint, request;
            if($('input#chainedTranslation').prop('checked')) {
                endpoint = '/translateChain';
                request = {'langpairs': chosenPath.join('|')};
            }
            else {
                endpoint = '/translate';
                request = {'langpair': curSrcLang + '|' + curDstLang};
            }
            request.q = $('#originalText').val(); // eslint-disable-line id-length
            request.markUnknown = $('#markUnknown').prop('checked') ? 'yes' : 'no';
            textTranslateRequest = $.jsonp({
                url: config.APY_URL + endpoint,
                beforeSend: ajaxSend,
                complete: function () {
                    ajaxComplete();
                    textTranslateRequest = undefined;
                },
                data: request,
                success: function (data) {
                    if(data.responseStatus === HTTP_OK_CODE) {
                        $('#translatedText').val(data.responseData.translatedText);
                        $('#translatedText').removeClass('notAvailable text-danger');
                    }
                    else {
                        translationNotAvailable();
                    }
                },
                error: translationNotAvailable
            });
        }
        else {
            translationNotAvailable();
        }
    }
}

function inputFile() {
    if($('input#fileInput')[0].files.length > 0 && $('input#fileInput')[0].files[0].length !== 0) {
        return $('input#fileInput')[0].files[0];
    }
    return undefined;           // like droppedFile
}

function translateDoc() {
    var validPair = pairs[curSrcLang] && pairs[curSrcLang].indexOf(curDstLang) !== -1,
        file = droppedFile !== undefined ? droppedFile : inputFile();
    if(validPair && file !== undefined) {
        if(file.size > UPLOAD_FILE_SIZE_LIMIT) {
            docTranslateError(getDynamicLocalization('File_Too_Large'), 'File_Too_Large');
        }
        else {
            // Keep in sync with accept attribute of input#fileInput:
            var allowedMimeTypes = [
                '',               // epiphany-browser gives this instead of a real MIME type
                'text/plain', 'text/html',
                'text/rtf', 'application/rtf',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                // 'application/msword', 'application/vnd.ms-powerpoint', 'application/vnd.ms-excel'
                'application/vnd.oasis.opendocument.text',
                'application/x-latex', 'application/x-tex'
            ];

            if(allowedMimeTypes.indexOf(file.type) !== -1) {
                $('span#uploadError').fadeOut('fast');
                $('a#fileDownload').hide();
                $('span#uploadError').hide();
                $('input#fileInput').prop('disabled', true);
                $('button#translate').prop('disabled', true);

                var xhr = new XMLHttpRequest({mozSystem: true});
                xhr.addEventListener('progress', updateProgressBar, false);
                if(xhr.upload) {
                    xhr.upload.onprogress = updateProgressBar;
                }
                var fileName = file.name;
                xhr.onreadystatechange = function () {
                    if(this.readyState === XHR_LOADING) {
                        $('div#fileLoading').fadeIn('fast');
                        $('div#fileUploadProgress').parent().fadeIn('fast', function () {
                            updateProgressBar({'loaded': 1, 'total': 1, 'position': undefined, 'totalSize': undefined});
                        });
                    }
                    else if(this.readyState === XHR_DONE && xhr.status === HTTP_OK_CODE) {
                        downloadBrowserWarn();
                        $('div#fileUploadProgress').parent().fadeOut('fast');
                        $('div#fileLoading').fadeOut('fast', function () {
                            var URL = window.URL || window.webkitURL;
                            $('a#fileDownload')
                                .attr('href', URL.createObjectURL(xhr.response))
                                .attr('download', fileName)
                                .fadeIn('fast');
                            $('span#fileDownloadText').text(getDynamicLocalization('Download_File').replace('{{fileName}}', fileName));
                            $('button#translate').prop('disabled', false);
                            $('input#fileInput').prop('disabled', false);
                        });
                    }
                    else if(this.status >= HTTP_BAD_REQUEST_CODE) {
                        docTranslateError(getDynamicLocalization('Not_Available'));
                    }
                };
                xhr.onerror = function () {
                    docTranslateError(getDynamicLocalization('Not_Available'));
                };

                updateProgressBar({'loaded': 0, 'total': 1, 'position': undefined, 'totalSize': undefined});
                $('div#fileUploadProgress').parent().fadeIn('fast');
                xhr.open('post', config.APY_URL + '/translateDoc', true);
                xhr.responseType = 'blob';
                var fileData = new FormData();
                fileData.append('langpair', curSrcLang + '|' + curDstLang);
                fileData.append('markUnknown', $('#markUnknown').prop('checked') ? 'yes' : 'no');
                fileData.append('file', file);
                xhr.send(fileData);
                sendEvent('translator', 'translateDoc', curSrcLang + '-' + curDstLang, file.size);
            }
            else {
                console.warn('Browser gave MIME type as', file.type);
                docTranslateError(getDynamicLocalization('Format_Not_Supported'), 'Format_Not_Supported');
            }
        }
    }
    else {
        docTranslateError(getDynamicLocalization('Not_Available'));
    }

    function updateProgressBar(ev) {
        var progress = 0.0;
        if(ev instanceof ProgressEvent) {
            progress = ev.loaded / ev.total;
        }
        else {
            console.warn('Strange event type given to updateProgressBar:');
            console.warn(ev);
        }
        var percentDone = Math.floor(progress * 1000) / 10;
        $('div#fileUploadProgress').attr('aria-valuenow', percentDone).css('width', percentDone + '%');
    }

    function docTranslateError(errorMessage, errorTextName) {
        $('div#fileUploadProgress').parent().fadeOut('fast', function () {
            $('span#uploadError')
                .text(errorMessage)
                .attr('data-text', errorTextName)
                .fadeIn('fast');
        });
        $('a#fileDownload').fadeOut('fast');
        $('div#fileLoading').fadeOut('fast');
        $('button#translate').prop('disabled', false);
        $('input#fileInput').prop('disabled', false);
        console.error(errorMessage);
    }
}

function downloadBrowserWarn() {
    if(typeof $bu_getBrowser == 'function') { // eslint-disable-line camelcase
        var detected = $bu_getBrowser();
        // Show the warning for (what bu calls) 'niche' browsers and Safari, but not Chromium:
        if(detected.n.match(/^[xs]/) && !(navigator.userAgent.match(/Chromium/))) {
            $('#fileDownloadBrowserWarning').show();
        }
    }
}
function detectLanguage() {
    if(textTranslateRequest) {
        textTranslateRequest.abort();
    }

    textTranslateRequest = $.jsonp({
        url: config.APY_URL + '/identifyLang',
        beforeSend: ajaxSend,
        complete: function () {
            ajaxComplete();
            textTranslateRequest = undefined;
        },
        data: {
            'q': $('#originalText').val()
        },
        success: function (data) {
            var possibleLanguages = [];
            for(var lang in data) {
                possibleLanguages.push([lang.indexOf('-') !== -1 ? lang.split('-')[0] : lang, data[lang]]);
            }
            possibleLanguages.sort(function (a, b) {
                return b[1] - a[1];
            });

            var oldSrcLangs = recentSrcLangs;
            recentSrcLangs = [];
            for(var i = 0; i < possibleLanguages.length; i++) {
                if(recentSrcLangs.length < TRANSLATION_LIST_BUTTONS && possibleLanguages[i][0] in pairs) {
                    recentSrcLangs.push(possibleLanguages[i][0]);
                }
            }
            recentSrcLangs = recentSrcLangs.concat(oldSrcLangs);
            if(recentSrcLangs.length > TRANSLATION_LIST_BUTTONS) {
                recentSrcLangs = recentSrcLangs.slice(0, TRANSLATION_LIST_BUTTONS);
            }

            curSrcLang = recentSrcLangs[0];
            $('#srcLangSelect').val(curSrcLang);
            muteLanguages();

            $('#detectedText').parent('.srcLang').attr('data-code', curSrcLang);
            refreshLangList();
            $('#detectedText').show();
            $('#detectText').hide();
        },
        error: function () {
            $('#srcLang1').click();
        }
    });
}

function translationNotAvailable() {
    $('#translatedText')
        .val(getDynamicLocalization('Not_Available'))
        .text(getDynamicLocalization('Not_Available'))
        .addClass('notAvailable text-danger');
}

function muteLanguages() {
    $('.languageName.text-muted').removeClass('text-muted');
    $('.dstLang').removeClass('disabledLang').prop('disabled', false);

    $.each($('#dstLanguages .languageName'), function () {
        if(!pairs[curSrcLang] || pairs[curSrcLang].indexOf($(this).attr('data-code')) === -1) {
            $(this).addClass('text-muted');
        }
    });
    $.each($('.dstLang'), function () {
        if(!pairs[curSrcLang] || pairs[curSrcLang].indexOf($(this).attr('data-code')) === -1) {
            $(this).addClass('disabledLang').prop('disabled', true);
        }
    });

    $.each($('#dstLangSelect option'), function (i, element) {
        $(element).prop('disabled', !pairs[curSrcLang] || pairs[curSrcLang].indexOf($(element).val()) === -1);
    });
}

function autoSelectDstLang() {
    if(pairs[curSrcLang] && pairs[curSrcLang].indexOf(curDstLang) === -1) {
        var newDstLang;
        for(var i = 0; i < recentDstLangs.length; i++) {
            if(pairs[curSrcLang].indexOf(recentDstLangs[i]) !== -1) {
                newDstLang = recentDstLangs[i];
                break;
            }
        }
        if(!newDstLang) {
            newDstLang = pairs[curSrcLang][0];
        }

        if(recentDstLangs.indexOf(newDstLang) === -1) {
            handleNewCurrentLang(newDstLang, recentDstLangs, 'dstLang');
        }
        else {
            curDstLang = newDstLang;
            $('.dstLang').removeClass('active');
            refreshLangList();
            $('.dstLang[data-code=' + curDstLang + ']').addClass('active');
            muteLanguages();
            localizeInterface();
            translateText();
        }
    }
}

/*:: import {synchronizeTextareaHeights, modeEnabled, ajaxSend, ajaxComplete, filterLangList, onlyUnique, getLangByCode} from './util.js' */
/*:: import {persistChoices, restoreChoices} from './persistence.js' */
/*:: import localizeInterface from './localization.js' */
/*:: import {readCache,cache} from './cache.js' */
/*:: import {config} from './config.js' */
