/*
MIT License

Copyright (c) 2022-2024 Mickaël Blet

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the 'Software'), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
const vscode = require('vscode');

const extensionId = 'highlight.regex';
const extensionName = 'Highlight regex';
let log = undefined;
let manager = undefined;

class Parser {

	constructor(scope, configuration, regexesConfiguration) {
		this.scope = scope;
		this.active = true;
		this.cacheEditorLimit = 0;
		this.regexes = [];
		this.decorations = [];
		this.cacheEditors = [];
		this.cacheEditorList = [];
		this.loadConfigurations(configuration, regexesConfiguration);
	}

	//
	// PUBLIC
	//

	// load configuration from contributions
	loadConfigurations(configuration, regexesConfiguration) {
		let loadRegexes = (configuration, regex, regexLevel = 0) => {
			// transform 'a(?: )bc(def(ghi)xyz)' to '(a)((?: ))(bc)((def)(ghi)(xyz))'
			let addHiddenMatchGroups = (sRegex) => {
				let jumpToEndOfBrace = (text, index) => {
					let level = 1;
					while (level > 0) {
						index++;
						if (index == text.length) {
							break;
						}
						switch (text[index]) {
							case '}':
								if ('\\' !== text[index - 1]) {
									level--;
									if ('?' === text[index + 1]) {
										index++; // jump '}'
									}
								}
								break;
							default:
								break;
						}
					}
					return index;
				}

				let jumpToEndOfBracket = (text, index) => {
					let level = 1;
					while (level > 0) {
						index++;
						if (index == text.length) {
							break;
						}
						switch (text[index]) {
							case ']':
								if ('\\' !== text[index - 1]) {
									level--;
									if ('*' === text[index + 1]) {
										index++; // jump ']'
										if ('?' === text[index + 1]) {
											index++; // jump '*'
										}
									}
									else if ('+' === text[index + 1]) {
										index++; // jump ']'
										if ('?' === text[index + 1]) {
											index++; // jump '+'
										}
									}
									else if ('?' === text[index + 1]) {
										index++; // jump ']'
										if ('?' === text[index + 1]) {
											index++; // jump '?'
										}
									}
									else if ('{' === text[index + 1]) {
										index++; // jump ']'
										index = jumpToEndOfBrace(text, index);
									}
								}
								break;
							default:
								break;
						}
					}
					return index;
				}

				let jumpToEndOfParenthesis = (text, index) => {
					let level = 1;
					while (level > 0) {
						index++;
						if (index == text.length) {
							break;
						}
						switch (text[index]) {
							case '(':
								if ('\\' !== text[index - 1]) {
									level++;
								}
								break;
							case ')':
								if ('\\' !== text[index - 1]) {
									level--;
									if ('*' === text[index + 1]) {
										index++; // jump ')'
										if ('?' === text[index + 1]) {
											index++; // jump '*'
										}
									}
									else if ('+' === text[index + 1]) {
										index++; // jump ')'
										if ('?' === text[index + 1]) {
											index++; // jump '+'
										}
									}
									else if ('?' === text[index + 1]) {
										index++; // jump ')'
										if ('?' === text[index + 1]) {
											index++; // jump '?'
										}
									}
									else if ('{' === text[index + 1]) {
										index++; // jump ')'
										index = jumpToEndOfBrace(text, index);
									}
								}
								break;
							case '[':
								if ('\\' !== text[index - 1]) {
									index = jumpToEndOfBracket(text, index);
								}
								break;
							default:
								break;
						}
					}
					return index;
				}

				let splitOrRegex = (text) => {
					let ret = [];
					let start = 0;
					let end = 0;
					for (let i = 0; i < text.length; i++) {
						// is bracket
						if ('[' === text[i] && (i == 0 || i > 0 && '\\' !== text[i - 1])) {
							i = jumpToEndOfBracket(text, i);
						}
						// is real match group
						if ('(' === text[i] && (i == 0 || i > 0 && '\\' !== text[i - 1])) {
							i = jumpToEndOfParenthesis(text, i);
						}
						// is or
						if ('|' === text[i]) {
							end = i;
							ret.push(text.substr(start, end - start));
							start = i + 1;
						}
					}
					if (start > 0) {
						ret.push(text.substr(start, text.length - start));
					}
					else {
						ret.push(text);
					}
					return ret;
				}
				function hasMatchGroup(str) {
					let hasGroup = false;
					// check if match group exists
					for (let i = 0; i < str.length; i++) {
						if ('[' === str[i] && (i == 0 || i > 0 && '\\' !== str[i - 1])) {
							i = jumpToEndOfBracket(str, i);
						}
						if ('(' === str[i] && (i == 0 || i > 0 && '\\' !== str[i - 1])) {
							hasGroup = true;
							break;
						}
					}
					return hasGroup;
				}

				function convertBackSlash(str, offset, input) {
					return '####B4CKSL4SHB4CKSL4SH####';
				}
				function reloadBackSlash(str, offset, input) {
					return '\\\\';
				}

				// replace all '\\'
				let sRegexConverted = sRegex.replace(/\\\\/gm, convertBackSlash);

				let matchIndexToReal = { 0: 0 };
				let matchNamedToReal = {};
				let matchDependIndexes = { 0: [] };

				// not match group found
				if (!hasMatchGroup(sRegexConverted)) {
					// default return
					return {
						sRegex,
						matchIndexToReal,
						matchNamedToReal,
						matchDependIndexes
					};
				}

				// -------------------------------------------------------------------------
				// create a newRegex

				let newStrRegex = '';

				let index = 1;
				let realIndex = 1;

				let findGroups = (text, parentIndexes = [], dependIndexes = []) => {
					let addSimpleGroup = (str, prefix = '(', sufix = ')') => {
						// update newRegex
						newStrRegex += prefix + str + sufix;

						// add depend
						dependIndexes.push(index);

						index++;
					}
					let getEndOfGroup = (str, i) => {
						while (i > 0 && ')' !== str[i]) {
							i--;
						}
						return i;
					}

					let start = 0;
					let end = 0;

					for (let i = 0; i < text.length; i++) {
						// is not capture group
						if ('(' === text[i] && '?' === text[i + 1] && (i == 0 || i > 0 && '\\' !== text[i - 1])) {
							// set cursor before found
							end = i;
							if (end - start > 0) {
								// before
								addSimpleGroup(text.substr(start, end - start));
							}

							// check type of not capture group

							i++; // jump '('
							i++; // jump '?'

							// is assert
							if ('<' === text[i] && ('=' === text[i + 1] || '!' === text[i + 1])) {
								newStrRegex += '((?<' + text[i + 1];
								i++; // jump '<'
								start = i + 1;
								i = jumpToEndOfParenthesis(text, i);
								end = i;
							}
							// is assert
							else if ('=' === text[i] || '!' === text[i]) {
								newStrRegex += '((?' + text[i];
								start = i + 1;
								i = jumpToEndOfParenthesis(text, i);
								end = i;
							}
							// is named
							else if ('<' === text[i]) {
								newStrRegex += '((?:';
								start = i + 1;
								for (let j = i; j < text.length; j++) {
									i++;
									if (text[j] === '>') {
										break;
									}
								}

								matchNamedToReal[text.substr(start, i - start - 1)] = index;

								// add index in real
								matchIndexToReal[realIndex] = index;
								matchDependIndexes[index] = dependIndexes.filter(item => !parentIndexes.includes(item));

								realIndex++;

								start = i;
								i = jumpToEndOfParenthesis(text, i);
								end = i;
							}
							// is non capture group
							else if (':' === text[i]) {
								newStrRegex += '((?:';
								start = i + 1;
								i = jumpToEndOfParenthesis(text, i);
								end = i;
							}
							else {
								log.error(`regex: bad pattern ?`);
							}

							// get the end of group ')[...]'
							let endGroup = getEndOfGroup(text, end);
							// get content of group
							let sGroup = text.substr(start, endGroup - start);

							// add in depend
							dependIndexes.push(index);
							parentIndexes.push(index);

							index++;

							let splitRegex = splitOrRegex(sGroup);
							for (let j = 0; j < splitRegex.length; j++) {
								if (j > 0) {
									newStrRegex += '|';
								}
								findGroups(splitRegex[j], parentIndexes.slice(), dependIndexes.slice());
							}

							parentIndexes.pop();

							newStrRegex += ')' + text.substr(endGroup + 1, end - endGroup) + ')';

							start = i + 1; // jump ')'
						}
						// is bracket
						if ('[' === text[i] && (i == 0 || i > 0 && '\\' !== text[i - 1])) {
							i = jumpToEndOfBracket(text, i);
						}
						// is real match group
						if ('(' === text[i] && '?' !== text[i + 1] && (i == 0 || i > 0 && '\\' !== text[i - 1])) {
							// set cursor before found
							end = i;
							if (end - start > 0) {
								// before
								addSimpleGroup(text.substr(start, end - start));
							}

							start = i + 1;
							i = jumpToEndOfParenthesis(text, i);
							end = i;

							// get the end of group ')[...]'
							let endGroup = getEndOfGroup(text, end);
							// get content of group
							let sGroup = text.substr(start, endGroup - start);

							// add index in real
							matchIndexToReal[realIndex] = index;
							matchDependIndexes[index] = dependIndexes.filter(item => !parentIndexes.includes(item));

							dependIndexes.push(index);
							parentIndexes.push(index);

							index++;
							realIndex++;

							newStrRegex += '(';

							if (end !== endGroup) {
								newStrRegex += '(?:';
							}

							let splitRegex = splitOrRegex(sGroup);
							for (let j = 0; j < splitRegex.length; j++) {
								if (j > 0) {
									newStrRegex += '|';
								}
								findGroups(splitRegex[j], parentIndexes.slice(), dependIndexes.slice());
							}

							parentIndexes.pop();

							if (end !== endGroup) {
								newStrRegex += ')' + text.substr(endGroup + 1, end - endGroup);
							}

							newStrRegex += ')';

							start = i + 1;
						}
					}
					if (start > 0 && text.length > (end + 1) && text.length - start > 0) {
						addSimpleGroup(text.substr(start, text.length - start));
					}
					else if (start == 0) {
						newStrRegex += text;
					}
				}
				let splitRegex = splitOrRegex(sRegexConverted);
				for (let i = 0; i < splitRegex.length; i++) {
					if (i > 0) {
						newStrRegex += '|';
					}
					findGroups(splitRegex[i]);
				}

				// rollback replace all '\\'
				newStrRegex = newStrRegex.replace(/####B4CKSL4SHB4CKSL4SH####/gm, reloadBackSlash);
				return {
					sRegex: newStrRegex,
					matchIndexToReal,
					matchNamedToReal,
					matchDependIndexes
				};
			}
			if (regex.regex === undefined) {
				throw 'regex not found';
			}
			// force copy
			let regexStr = JSON.parse(JSON.stringify(regex.regex));
			if (typeof regexStr !== 'string') {
				regexStr = regexStr.join('');
			}
			let regexRegExp = new RegExp(regexStr, (regex.regexFlag) ? regex.regexFlag : configuration.defaultRegexFlag);
			regexRegExp.test();
			// add hide groups
			let { sRegex, matchIndexToReal, matchNamedToReal, matchDependIndexes } = addHiddenMatchGroups(regexStr);
			regexRegExp = new RegExp(sRegex, (regex.regexFlag) ? regex.regexFlag : configuration.defaultRegexFlag);
			regexRegExp.test();
			let decorationList = [];
			let regexList = [];
			if (regex.regexes?.length > 0) {
				for (let regexes of regex.regexes) {
					regexList.push(loadRegexes(configuration, regexes, regexLevel + 1));
				}
			}
			if (regex.decorations?.length > 0) {
				regex.decorations.sort((a, b) => {
					let keyA = (a.index) ? a.index : 0;
					let keyB = (b.index) ? b.index : 0;
					if (keyA < keyB) return 1;
					if (keyA > keyB) return -1;
					return 0;
				});
				for (let decoration of regex.decorations) {
					// force copy
					let decorationCopy = JSON.parse(JSON.stringify(decoration));
					let index = (decorationCopy.index) ? decorationCopy.index : 0;
					let hoverMessage = (decorationCopy.hoverMessage) ? decorationCopy.hoverMessage : undefined;
					if (hoverMessage && typeof hoverMessage !== 'string') {
						hoverMessage = hoverMessage.join('');
					}
					// z-index for background level
					if (decorationCopy.backgroundColor) {
						decorationCopy.backgroundColor += '; z-index: ' + ((-100 * (10 - regexLevel)) + index)
					}
					else {
						decorationCopy.backgroundColor = 'transparent; z-index: ' + ((-100 * (10 - regexLevel)) + index)
					}
					delete decorationCopy.index;
					delete decorationCopy.hoverMessage;
					decorationList.push({
						index: index,
						hoverMessage: hoverMessage,
						decoration: this.decorations.length,
					});
					this.decorations.push(vscode.window.createTextEditorDecorationType(decorationCopy));
				}
			}
			return {
				index: (regex.index) ? regex.index : 0,
				regexRegExp: regexRegExp,
				matchIndexToReal: matchIndexToReal,
				matchNamedToReal: matchNamedToReal,
				matchDependIndexes: matchDependIndexes,
				regexCount: 0,
				regexLimit: (regex.regexLimit) ? regex.regexLimit : configuration.defaultRegexLimit,
				regexes: regexList,
				decorations: decorationList
			};
		}
		// reset regex
		this.regexes = [];
		this.decorations = []
		this.cacheEditors = [];
		this.cacheEditorList = [];
		this.cacheEditorLimit = configuration.cacheLimit;
		// load regexes configuration
		for (let regexList of regexesConfiguration) {
			// compile regex
			try {
				let active = (regexList.active === undefined) ? true : regexList.active;
				// stock languages
				let languages = (regexList.languageIds) ? regexList.languageIds : undefined;
				let languageRegex = new RegExp((regexList.languageRegex) ? regexList.languageRegex : '.*', '');
				languageRegex.test();
				let filenameRegex = new RegExp((regexList.filenameRegex) ? regexList.filenameRegex : '.*', '');
				filenameRegex.test();
				let regexes = [];
				if (regexList.regexes?.length > 0) {
					for (let regex of regexList.regexes) {
						regexes.push(loadRegexes(configuration, regex));
					}
				}
				this.regexes.push({
					active: active,
					languages: languages,
					languageRegex: languageRegex,
					filenameRegex: filenameRegex,
					regexes: regexes
				});
			}
			catch (error) {
				log.error(`${this.scope}: ${error.toString()}`);
				vscode.window.showErrorMessage(error.toString(), 'Close');
			}
		}
	}

	resetDecorations(editor) {
		if (!editor) {
			return;
		}
		try {
			for (let decoration of this.decorations) {
				// disable old decoration
				editor.setDecorations(decoration, []);
			}
			log.info(`${this.scope}: Reset decorations at "${editor.document.fileName}"`);
		}
		catch (error) {
			log.error(`${this.scope}: ${error.toString()}`);
		}
	}

	updateDecorations(editor) {
		if (!editor) {
			return;
		}
		let key = editor.document.uri.toString(true);
		if (!this.active) {
			if (key in this.cacheEditors) {
				delete this.cacheEditors[key];
				// remove element on cache editor list
				this.cacheEditorList.splice(this.cacheEditorList.indexOf(key), 1);
			}
			return;
		}
		if (!(key in this.cacheEditors)) {
			if (this.cacheEditorList.length > this.cacheEditorLimit) {
				let firstCacheEditor = this.cacheEditorList.shift();
				if (firstCacheEditor) {
					delete this.cacheEditors[firstCacheEditor];
				}
			}
			this.cacheEditorList.push(key);
		}
		this.cacheEditors[key] = [];
		let cacheRanges = [];
		for (const _ in this.decorations) {
			cacheRanges.push([]);
		}
		var recurseSearchDecorations = (regex, text, index = 0) => {
			let search;
			regex.regexCount = 0;
			regex.regexRegExp.lastIndex = 0;
			while (search = regex.regexRegExp.exec(text)) {
				regex.regexCount++;
				if (regex.regexCount > regex.regexLimit) {
					log.warn(`${this.scope}: Count overload pattern "${regex.regexRegExp.source}" > ${regex.regexLimit} occurence(s)`);
					break;
				}
				if (search[0].length == 0) {
					log.error(`${this.scope}: Bad pattern "${regex.regexRegExp.source}"`);
					break;
				}
				if (regex.decorations && regex.decorations.length > 0) {
					for (let decoration of regex.decorations) {
						if (decoration.decoration === undefined) {
							continue;
						}
						let decorationRealIndex;
						if (typeof decoration.index === 'number') {
							decorationRealIndex = regex.matchIndexToReal[decoration.index];
						}
						else {
							decorationRealIndex = regex.matchNamedToReal[decoration.index];
						}
						if (decorationRealIndex < search.length && search[decorationRealIndex] && search[decorationRealIndex].length > 0) {
							let decorationIndex = search.index;
							for (let j = 0; j < regex.matchDependIndexes[decorationRealIndex].length; j++) {
								if (search[regex.matchDependIndexes[decorationRealIndex][j]]) {
									decorationIndex += search[regex.matchDependIndexes[decorationRealIndex][j]].length;
								}
							}
							let vsRange = new vscode.Range(
								editor.document.positionAt(index + decorationIndex),
								editor.document.positionAt(index + decorationIndex + search[decorationRealIndex].length)
							);
							if (decoration.hoverMessage) {
								let htmlHovermessage = new vscode.MarkdownString();
								htmlHovermessage.supportHtml = true;
								htmlHovermessage.isTrusted = true;
								htmlHovermessage.appendMarkdown(decoration.hoverMessage);
								cacheRanges[decoration.decoration].push({
									range: vsRange,
									hoverMessage: htmlHovermessage
								});
							}
							else {
								cacheRanges[decoration.decoration].push({
									range: vsRange
								});
							}
						}
					}
				}
				if (regex.regexes && regex.regexes.length > 0) {
					for (let insideRegex of regex.regexes) {
						let insideRegexRealIndex;
						if (typeof insideRegex.index === 'number') {
							insideRegexRealIndex = regex.matchIndexToReal[insideRegex.index];
						}
						else {
							insideRegexRealIndex = regex.matchNamedToReal[insideRegex.index];
						}
						if (insideRegexRealIndex < search.length && search[insideRegexRealIndex] && search[insideRegexRealIndex].length > 0) {
							let regexIndex = search.index;
							for (let j = 0; j < regex.matchDependIndexes[insideRegexRealIndex].length; j++) {
								if (search[regex.matchDependIndexes[insideRegexRealIndex][j]]) {
									regexIndex += search[regex.matchDependIndexes[insideRegexRealIndex][j]].length;
								}
							}
							recurseSearchDecorations(insideRegex, search[insideRegexRealIndex], index + regexIndex);
						}
					}
				}
			}
		}
		let useWithRegexes = false;
		let startTime = Date.now();
		let text = editor.document.getText();
		try {
			// search all regexes
			for (let regexes of this.regexes) {
				// has regex
				if (regexes.regexes === undefined) {
					continue;
				}
				// isActive
				if (regexes.active === false) {
					continue;
				}
				// check language
				if (editor.document.languageId) {
					if (regexes.languages != undefined) {
						if (regexes.languages.indexOf(editor.document.languageId) < 0) {
							log.debug(`${this.scope}: languageIds [${regexes.languages}] not match with "${editor.document.languageId}" at "${editor.document.fileName}"`);
							continue;
						}
					}
					else {
						if (!regexes.languageRegex.test(editor.document.languageId)) {
							log.debug(`${this.scope}: languageRegex "${regexes.languageRegex}" not match with "${editor.document.languageId}" at "${editor.document.fileName}"`);
							continue;
						}
					}
				}
				// check filename
				if (editor.document.fileName && !regexes.filenameRegex.test(editor.document.fileName)) {
					log.debug(`${this.scope}: filenameRegex "${regexes.filenameRegex}" not match with "${editor.document.fileName}" at "${editor.document.fileName}"`);
					continue;
				}
				useWithRegexes = true;
				// foreach regexes
				for (let regex of regexes.regexes) {
					recurseSearchDecorations(regex, text);
				}
			}

		}
		catch (error) {
			log.error(`${this.scope}: ${error.toString()}`);
		}

		if (useWithRegexes === false) {
			return;
		}

		try {
			let countDecoration = 0;
			for (const decorationIndex in cacheRanges) {
				countDecoration += cacheRanges[decorationIndex].length;
				editor.setDecorations(
					this.decorations[decorationIndex],
					cacheRanges[decorationIndex]
				);
			}
			if (countDecoration > 0) {
				log.debug(`${this.scope}: Update decorations at "${editor.document.fileName}" with ${countDecoration} occurence(s) in ${(Date.now() - startTime)} millisecond(s)`);
				log.info(`${this.scope}: Update decorations at "${editor.document.fileName}" with ${countDecoration} occurence(s)`);
			}
			this.cacheEditors[key] = cacheRanges;
		}
		catch (error) {
			log.error(`${this.scope}: ${error.toString()}`);
		}
	}

	cacheDecorations(editor) {
		if (!editor || !this.active) {
			return;
		}
		try {
			let startTime = Date.now();
			let key = editor.document.uri.toString(true);
			if (key in this.cacheEditors && this.cacheEditors[key]) {
				// move key to the end of cached list
				this.cacheEditorList.splice(this.cacheEditorList.indexOf(key), 1);
				this.cacheEditorList.push(key);

				let countDecoration = 0;
				const cacheRanges = this.cacheEditors[key];
				for (const decorationIndex in cacheRanges) {
					countDecoration += cacheRanges[decorationIndex].length;
					editor.setDecorations(
						this.decorations[decorationIndex],
						cacheRanges[decorationIndex]
					);
				}
				if (countDecoration > 0) {
					log.debug(`${this.scope}: Cached decorations at "${editor.document.fileName}" with ${countDecoration} occurence(s) in ${(Date.now() - startTime)} millisecond(s)`);
					log.info(`${this.scope}: Cached decorations at "${editor.document.fileName}" with ${countDecoration} occurence(s)`);
				}
			}
			else {
				log.debug(`${this.scope}: Cached decorations not exists at "${editor.document.fileName}"`);
				this.updateDecorations(editor);
			}
		}
		catch (error) {
			log.error(`${this.scope}: ${error.toString()}`);
		}
	}

	toggle(visibleTextEditors) {
		this.active = !this.active;
		if (this.active) {
			for (let i = 0; i < visibleTextEditors.length; i++) {
				this.cacheDecorations(visibleTextEditors[i]);
			}
		}
		else {
			for (let i = 0; i < visibleTextEditors.length; i++) {
				this.resetDecorations(visibleTextEditors[i]);
			}
		}
	}
}; // class Parser

class TreeDataProvider {
	constructor(scope) {
		this.items = [];
		this.scope = scope;
		// refresh event
		this._onDidChangeTreeData = new vscode.EventEmitter();
		this.onDidChangeTreeData = this._onDidChangeTreeData.event;

		this.loadConfigurations();
	}

	getTreeItem(element) {
		return element;
	}

	getChildren(element) {
		if (element) {
			return element.childrens;
		}
		else {
			return this.items;
		}
	}

	getParent(element) {
		return element;
	}

	loadConfigurations() {
		log.debug(`${this.scope.name}: TreeView: loadConfigurations`);
		let items = [];
		for (let i = 0; i < this.scope.regexes.length; i++) {
			const regexes = this.scope.regexes[i];
			try {
				items.push(new TreeItem(regexes, this.scope.name, this.scope.propertyName, i));
			}
			catch (error) {
				log.error(`${this.scope.name}: TreeView: ${error.toString()}`);
			}
		}
		this.items = items;
	}

	collapseAll() {
		log.debug(`${this.scope.name}: TreeView: collapseAll`);
		let tmpItems = [];
		for (let item of this.items) {
			if (item.label[item.label.length - 1] == ' ') {
				item.label = item.label.substr(0, item.label.length - 1);
			}
			else {
				item.label += ' ';
			}
			tmpItems.push(item);
		}
		this.items = tmpItems;
		this.refresh();
	}

	refresh() {
		this._onDidChangeTreeData.fire();
	}
}; // class TreeDataProvider

class TreeItem {
	constructor(regexes, scopeName, scopePropertyName, index) {
		// take the first regex if name not exists
		this.label = 'undefined';
		if (regexes.name !== undefined) {
			this.label = regexes.name;
		}
		else {
			if (regexes.regexes && regexes.regexes.length > 0 && regexes.regexes[0].regex !== undefined) {
				if (typeof regexes.regexes[0].regex === 'string') {
					this.label = regexes.regexes[0].regex;
				}
				else {
					// transform regex array to string
					this.label = regexes.regexes[0].regex.join('');
				}
			}
		}
		if (regexes.description !== undefined) {
			this.tooltip = regexes.description;
		}
		this.iconPath = new vscode.ThemeIcon('regex');
		this.contextValue = 'parent';
		this.regexes = regexes;
		this.scope = scopeName;
		this.index = index;
		this.path = `/${scopePropertyName}/[${index}]`
		this.checkboxState = regexes.active === undefined ? vscode.TreeItemCheckboxState.Checked : (regexes.active ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked);
		this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
		this.childrens = [];
		let sortedKeys = Object.keys(regexes).sort();
		for (let key of sortedKeys) {
			// not show active property
			if (key === 'active') {
				continue;
			}
			if (regexes.hasOwnProperty(key)) {
				this.generateChildrens(`${this.path}`, this.childrens, key, regexes[key]);
			}
		}
		if (this.childrens.length == 0) {
			this.collapsibleState = vscode.TreeItemCollapsibleState.None;
		}
	}

	generateChildrens(path, childs, name, value, isArray = false) {
		let label = isArray ? `[${name}]` : `${name}`;
		if (typeof value === 'object') {
			let parent = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Expanded);
			parent.path = `${path}/${label}`,
				parent.iconPath = Array.isArray(value) ? new vscode.ThemeIcon("array") : new vscode.ThemeIcon("json");
			parent.childrens = [];
			let sortedKeys = Object.keys(value).sort();
			for (let key of sortedKeys) {
				if (value.hasOwnProperty(key)) {
					this.generateChildrens(`${path}/${label}`, parent.childrens, key, value[key], (Array.isArray(value)));
				}
			}
			childs.push(parent);
		}
		else {
			let valueFormated = `${value}`;
			if (typeof value === 'string') {
				valueFormated = `"${valueFormated}"`;
			}
			let item = new vscode.TreeItem(`${label}: ${valueFormated}`, vscode.TreeItemCollapsibleState.None);
			item.path = `${path}/${label}`;
			item.tooltip = value;
			childs.push(item);
		}
	}
}; // class TreeItem

class ScopeManager {

	constructor(configuration) {
		// const configuration = vscode.workspace.getConfiguration(extensionId);

		this.user = new Scope('user', `${extensionId}.regexes`, configuration, configuration.regexes);
		this.workspace = new Scope('workspace', `${extensionId}.workspace.regexes`, configuration, configuration.workspace.regexes);
		this.map = [];
		this.map['user'] = this.user;
		this.map['workspace'] = this.workspace;
	}

}; // class ScopeManager

class Scope {
	constructor(name, propertyName, configuration, regexes) {
		this.name = name;
		this.propertyName = propertyName;
		this.configuration = configuration;
		this.regexes = regexes;
		this.configurationChangeEvent = true;
		this.changed = false;

		this.parser = new Parser(this.name, this.configuration, this.regexes);
		this.treeDataProvider = new TreeDataProvider(this);
		this.tree = vscode.window.createTreeView(`${extensionId}.view.${this.name}`, {
			canSelectMany: true,
			treeDataProvider: this.treeDataProvider
		});

		let self = this;
		// TreeView events
		this.tree.onDidChangeCheckboxState((event) => {
			for (let item of event.items) {
				let treeItem = item[0];
				let actived = item[1] ? true : false;
				treeItem.regexes.active = actived;
				log.debug(`${self.name}: treeView: onDidChangeCheckboxState: ${treeItem.label} to ${treeItem.regexes.active}`);
			}
			self.resetDecorations();
			self.updateDecorations();
			self.updateConfiguration();
		});
		this.updateTreeTitle();
	}

	updateTreeTitle() {
		let inspect = this.configuration.inspect(this.propertyName.substring(extensionId.length + 1));
		let scopes = [
			['workspaceFolderLanguageValue', 'workspace folder language'],
			['workspaceLanguageValue', 'workspace language'],
			['globalLanguageValue', 'global language'],
			['defaultLanguageValue', 'default language'],
			['workspaceFolderValue', 'workspace folder'],
			['workspaceValue', 'workspace'],
			['globalValue', 'global'],
			['defaultValue', 'default']
		];
		let scopeStr = "undefined";
		for (const language of scopes) {
			if (language[0] in inspect && inspect[language[0]] !== undefined) {
				scopeStr = language[1];
				break;
			}
		}
		this.tree.description = `${scopeStr} settings`;
	}

	loadFromConfiguration() {
		if (this.name == 'user') {
			this.regexes = vscode.workspace.getConfiguration(extensionId).regexes;
		}
		else if (this.name == 'workspace') {
			this.regexes = vscode.workspace.getConfiguration(extensionId).workspace.regexes;
		}
		this.treeDataProvider.loadConfigurations();
		this.treeDataProvider.refresh();
	}

	moveUpItem(index) {
		log.debug(`${this.name}: moveUpItem: ${index}`);
		if (this.regexes.length <= 1) {
			return index;
		}
		this.resetDecorations();
		if (index == 0) {
			this.regexes.splice(this.regexes.length - 1, 0, this.regexes.splice(index, 1)[0]);
			index = this.regexes.length - 1;
		}
		else {
			this.regexes.splice(index - 1, 0, this.regexes.splice(index, 1)[0]);
			index = index - 1;
		}
		this.treeDataProvider.loadConfigurations();
		this.treeDataProvider.refresh();
		this.updateDecorations();
		this.updateConfiguration();
		return index;
	}

	moveDownItem(index) {
		log.debug(`${this.name}: moveDownItem: ${index}`);
		if (this.regexes.length <= 1) {
			return index;
		}
		this.resetDecorations();
		if (index == this.regexes.length - 1) {
			this.regexes.splice(0, 0, this.regexes.splice(index, 1)[0]);
			index = this.regexes.length - 1;
		}
		else {
			this.regexes.splice(index + 1, 0, this.regexes.splice(index, 1)[0]);
			index = index + 1;
		}
		this.treeDataProvider.loadConfigurations();
		this.treeDataProvider.refresh();
		this.updateDecorations();
		this.updateConfiguration();
		return index;
	}

	resetDecorations() {
		log.debug(`${this.name}: resetDecorations`);
		for (let textEditor of vscode.window.visibleTextEditors) {
			this.parser.resetDecorations(textEditor);
		}
	}

	updateDecorations() {
		log.debug(`${this.name}: updateDecorations`);
		this.parser.loadConfigurations(this.configuration, this.regexes);
		for (let textEditor of vscode.window.visibleTextEditors) {
			this.parser.updateDecorations(textEditor);
		}
	}

	toggleDecorations() {
		this.parser.toggle(vscode.window.visibleTextEditors);
	}

	async updateConfiguration() {
		this.configurationChangeEvent = false;
		await vscode.workspace.getConfiguration().update(
			this.propertyName,
			this.regexes,
			vscode.ConfigurationTarget.Workspace
		);
		this.configurationChangeEvent = true;
	}
}; // class Scope

class QuickPick {
	constructor(scopeManager, setting) {
		this.scopeManager = scopeManager;
		this.quickpick = vscode.window.createQuickPick();
		this.quickpick.placeholder = 'Name of regex';
		this.quickpick.title = 'Choose your regexes';
		this.quickpick.canSelectMany = true;
		this.quickpick.matchOnDescription = true;
		this.quickpick.matchOnDetail = true;
		this.visible = false;
		this.activeEditorItems = [];
		let that = this;
		this.quickpick.onDidAccept(() => {
			log.debug('quickpick: onDidAccept');
			that.quickpick.hide();
		});
		this.quickpick.onDidHide(() => {
			log.debug('quickpick: onDidHide');
			for (let scopeKey in that.scopeManager.map) {
				let scope = scopeManager[scopeKey];
				if (scope.changed) {
					scope.updateConfiguration();
					scope.changed = false;
				}
			}
			that.visible = false;
			that.quickpick.hide();
		});
		this.quickpick.onDidChangeSelection((selectedItems, thisArgs) => {
			log.debug('quickpick: onDidChangeSelection');
			log.debug(`quickpick: onDidChangeSelection ${thisArgs}`);
			if (selectedItems === undefined) {
				return;
			}
			for (let scopeKey in that.scopeManager.map) {
				let scope = scopeManager[scopeKey];
				for (let i = 0; i < scope.regexes?.length; i++) {
					let j = 0;
					for (; j < selectedItems.length; j++) {
						if (selectedItems[j].scope == scope.name &&
							selectedItems[j].index == i &&
							selectedItems[j].onActiveEditor == false) {
							break;
						}
					}
					if (j === selectedItems.length) {
						if (scope.regexes[i].active == undefined || scope.regexes[i].active) {
							scope.regexes[i].active = false;
							scope.changed = true;
						}
					}
					else {
						if (scope.regexes[i].active == undefined || scope.regexes[i].active == false) {
							scope.regexes[i].active = true;
							scope.changed = true;
						}
					}

				}
				if (scope.changed) {
					scope.treeDataProvider.loadConfigurations();
					scope.treeDataProvider.refresh();
					scope.resetDecorations();
					scope.updateDecorations();
				}
			}
		});
		this.quickpick.onDidTriggerItemButton(async (event) => {
			log.debug('quickpick: onDidTriggerItemButton');
			if (event.button.tooltip == 'Edit') {
				let path = `/${that.scopeManager.map[event.item.scope].propertyName}/[${event.item.index}]`;
				if (path.startsWith("/highlight.regex.regexes")) {
					await manager.scopeManager.user.updateConfiguration();
				}
				else {
					await manager.scopeManager.workspace.updateConfiguration();
				}

				try {
					await manager.setting.open('workbench.action.openWorkspaceSettingsFile');
					manager.setting.focus(path);
				}
				catch (error) {
					log.error(`quickpick: onDidTriggerItemButton: ${error.toString()}`);
				}
			}
			else if (event.button.tooltip == 'Move up') {
				let index = await that.scopeManager.map[event.item.scope].moveUpItem(event.item.index);
				that.updateItems(vscode.window.activeTextEditor, event.item.scope, index);
				that.quickpick.show();
			}
			else if (event.button.tooltip == 'Move down') {
				let index = await that.scopeManager.map[event.item.scope].moveDownItem(event.item.index);
				that.updateItems(vscode.window.activeTextEditor, event.item.scope, index);
				that.quickpick.show();
			}
		});
	}

	updateItems(activeEditor, itemScope = undefined, itemIndex = undefined) {
		let items = [];
		let selectedItems = [];
		let activeItems = [];
		// this.activeEditorItems = [];
		// if (activeEditor) {
		// 	// separator
		// 	items.push({ label: "active", kind: -1 });
		// 	for (let scopeKey in this.scopeManager.map) {
		// 		let scope = this.scopeManager.map[scopeKey];
		// 		for (let i = 0; i < scope.regexes?.length; i++) {
		// 			const regexes = scope.regexes[i];
		// 			try {
		// 				let languageRegex = new RegExp((regexes.languageRegex) ? regexes.languageRegex : '.*', '');
		// 				languageRegex.test();
		// 				let filenameRegex = new RegExp((regexes.filenameRegex) ? regexes.filenameRegex : '.*', '');
		// 				filenameRegex.test();
		// 				// check language
		// 				if (activeEditor.document.languageId) {
		// 					if (regexes.languageIds != undefined) {
		// 						if (regexes.languageIds.indexOf(activeEditor.document.languageId) < 0) {
		// 							continue;
		// 						}
		// 					}
		// 					else {
		// 						if (!languageRegex.test(activeEditor.document.languageId)) {
		// 							continue;
		// 						}
		// 					}
		// 				}
		// 				// check filename
		// 				if (activeEditor.document.fileName && !filenameRegex.test(activeEditor.document.fileName)) {
		// 					continue;
		// 				}
		// 				let label = 'undefined';
		// 				if (regexes.name !== undefined) {
		// 					label = regexes.name;
		// 				}
		// 				else {
		// 					if (regexes.regexes && regexes.regexes.length > 0 && regexes.regexes[0].regex !== undefined) {
		// 						if (typeof regexes.regexes[0].regex === 'string') {
		// 							label = regexes.regexes[0].regex;
		// 						}
		// 						else {
		// 							// transform regex array to string
		// 							label = regexes.regexes[0].regex.join('');
		// 						}
		// 					}
		// 				}
		// 				let item = {
		// 					label: label,
		// 					description: regexes.description,
		// 					onActiveEditor: true,
		// 					scope: scope.name,
		// 					index: i,
		// 					picked: regexes.active === undefined ? true : regexes.active
		// 				};
		// 				this.activeEditorItems.push(item);
		// 				items.push(item);
		// 				if (item.picked) {
		// 					selectedItems.push(item);
		// 				}
		// 			}
		// 			catch (error) {
		// 				log.error('quickpick: ' + error.toString());
		// 			}
		// 		}
		// 	}
		// }
		for (let scopeKey in this.scopeManager.map) {
			let scope = this.scopeManager.map[scopeKey];
			// separator
			items.push({ label: scope.name, kind: -1 });
			for (let i = 0; i < scope.regexes?.length; i++) {
				const regexes = scope.regexes[i];
				try {
					let inActiveEditor = true;
					if (activeEditor) {
						let languageRegex = new RegExp((regexes.languageRegex) ? regexes.languageRegex : '.*', '');
							languageRegex.test();
						let filenameRegex = new RegExp((regexes.filenameRegex) ? regexes.filenameRegex : '.*', '');
						filenameRegex.test();
						// check language
						if (activeEditor.document.languageId) {
							if (regexes.languageIds != undefined) {
								if (regexes.languageIds.indexOf(activeEditor.document.languageId) < 0) {
									inActiveEditor = false;
								}
							}
							else {
								if (!languageRegex.test(activeEditor.document.languageId)) {
									inActiveEditor = false;
								}
							}
						}
						// check filename
						if (activeEditor.document.fileName && !filenameRegex.test(activeEditor.document.fileName)) {
							inActiveEditor = false;
						}
					}
					else {
						inActiveEditor = false;
					}
					let label = 'undefined';
					if (regexes.name !== undefined) {
						label = regexes.name;
					}
					else {
						if (regexes.regexes && regexes.regexes.length > 0 && regexes.regexes[0].regex !== undefined) {
							if (typeof regexes.regexes[0].regex === 'string') {
								label = regexes.regexes[0].regex;
							}
							else {
								// transform regex array to string
								label = regexes.regexes[0].regex.join('');
							}
						}
					}
					let item = {
						label: label,
						description: regexes.description,
						onActiveEditor: false,
						scope: scope.name,
						index: i,
						picked: regexes.active === undefined ? true : regexes.active,
						buttons: [
							{
								iconPath: new vscode.ThemeIcon('edit'),
								tooltip: "Edit"
							},
							{
								iconPath: new vscode.ThemeIcon('arrow-up'),
								tooltip: "Move up"
							},
							{
								iconPath: new vscode.ThemeIcon('arrow-down'),
								tooltip: "Move down"
							}
						]
					};
					if (inActiveEditor) {
						item.detail = "Use by active editor";
					}
					items.push(item);
					if (item.picked) {
						selectedItems.push(item);
					}
					if (itemScope !== undefined && itemIndex !== undefined && item.scope == itemScope && item.index == itemIndex) {
						activeItems.push(item);
					}
				}
				catch (error) {
					log.error('quickpick: ' + error.toString());
				}
			}
		}
		this.quickpick.items = items;
		this.quickpick.selectedItems = selectedItems;
		this.quickpick.activeItems = activeItems;
	}
}; // class QuickPick

class JsoncSettingParser {

	constructor(text) {
		this.text = text;
		this.index = 0;
		this.ranges = [];
		this.load();
	}

	load() {
		this.spaceJump();
		switch (this.text[this.index]) {
			case '{':
				this.dict = this.loadObject('');
				this.spaceJump();
				break;
			case '[':
				this.dict = this.loadArray('');
				this.spaceJump();
				break;
			case '\0':
				break;
			default:
				throw "Not a valid start character";
		}
		if (this.index != this.text.length) {
			throw "Not a valid end character";
		}
	}

	loadObject(path) {
		let obj = {};
		let next = true;
		this.ranges[path] = {
			start: this.index,
			end: this.index
		}
		this.index++; // jump '{'
		this.spaceJump();
		while (this.text[this.index] != '}' && next) {
			if (this.text[this.index] == '\0') {
				throw "End of object not found";
			}
			else if (this.text[this.index] == '"') {
				// search array, object, string, number, bool or null
				let key = this.getKey(obj);
				let element = this.loadType(`${path}/${key}`);
				if (element === undefined) {
					throw "Bad element in the key";
				}
				obj[key] = element;
			}
			else {
				throw "Key of object not found";
			}
			this.spaceJump();
			// next
			if (this.text[this.index] == ',') {
				this.index++; // jump ','
				next = true;
				this.spaceJump();
			}
			else {
				next = false;
			}
		}
		this.index++; // jump '}'
		this.ranges[path].end = this.index;
		return obj;
	}

	loadArray(path) {
		let array = [];
		let next = true;
		this.ranges[path] = {
			start: this.index,
			end: this.index
		}
		this.index++; // jump '['
		this.spaceJump();
		while (this.text[this.index] != ']' && next) {
			if (this.text[this.index] == '\0') {
				throw "End of array not found";
			}
			// search array, object, string, number, bool or null
			let element = this.loadType(`${path}/[${array.length}]`);
			if (element === undefined) {
				throw "Bad element of array";
			}
			array.push(element);
			this.spaceJump();
			// next
			if (this.text[this.index] == ',') {
				this.index++; // jump ','
				next = true;
				this.spaceJump();
			}
			else {
				next = false;
			}
		}
		this.index++; // jump ']'
		this.ranges[path].end = this.index;
		return array;
	}

	getKey(obj) {
		// parser key
		this.index++; // jump '"'
		let start = this.index;
		// search end quote
		while (this.text[this.index] != '"') {
			if (this.text[this.index] == '\\' && (this.text[this.index + 1] == '"' || this.text[this.index + 1] == '\\')) {
				this.index++;
			}
			else if (this.text[this.index] == '\0') {
				throw "End of key";
			}
			else if (this.text[this.index] == '\n') {
				throw "New line in key";
			}
			this.index++;
		}
		// get key
		let key = this.text.substring(start, this.index);
		if (obj && key in obj) {
			throw "Key already exist";
		}
		this.index++; // jump '"'
		this.spaceJump();
		if (this.text[this.index] != ':') {
			throw "Need definition of object";
		}
		this.index++; // jump ':'
		this.spaceJump();
		return key;
	}

	loadType(path) {
		let element = undefined;
		switch (this.text[this.index]) {
			case '[':
				element = this.loadArray(path);
				break;
			case '{':
				element = this.loadObject(path);
				break;
			case '"':
				element = this.loadString(path);
				break;
			case '-':
			case '0':
			case '1':
			case '2':
			case '3':
			case '4':
			case '5':
			case '6':
			case '7':
			case '8':
			case '9':
				element = this.loadNumber(path);
				break;
			case 't':
				if (this.text[this.index] == 't' &&
					this.text[this.index + 1] == 'r' &&
					this.text[this.index + 2] == 'u' &&
					this.text[this.index + 3] == 'e') {
					element = this.loadBool(path, true);
				}
				else {
					return undefined;
				}
				break;
			case 'f':
				if (this.text[this.index] == 'f' &&
					this.text[this.index + 1] == 'a' &&
					this.text[this.index + 2] == 'l' &&
					this.text[this.index + 3] == 's' &&
					this.text[this.index + 4] == 'e') {
					element = this.loadBool(path, false);
				}
				else {
					return undefined;
				}
				break;
			case 'n':
				if (this.text[this.index] == 'n' &&
					this.text[this.index + 1] == 'u' &&
					this.text[this.index + 2] == 'l' &&
					this.text[this.index + 3] == 'l') {
					element = this.loadNull(path);
				}
				else {
					return undefined;
				}
				break;
			default:
				return undefined;
		}
		return element;
	}

	loadNull(path) {
		this.ranges[path] = {
			start: this.index,
			end: this.index
		}
		this.index += 4;
		this.ranges[path].end = this.index;
		return null;
	}

	loadBool(path, boolean) {
		this.ranges[path] = {
			start: this.index,
			end: this.index
		}
		if (boolean) {
			this.index += 4;
		}
		else {
			this.index += 5;
		}
		this.ranges[path].end = this.index;
		return boolean;
	}

	loadNumber(path) {
		this.ranges[path] = {
			start: this.index,
			end: this.index
		}
		if (this.text[this.index] == '0' && this.text[this.index + 1] >= '0' && this.text[this.index + 1] <= '9') {
			throw "Octal number not allowed";
		}
		let startsWith = (text, reg, offset) => {
			let regex = new RegExp(`^.{${0, offset}}(${reg})`, 's');
			let found = text.match(regex);
			if (found) {
				return found[1];
			}
			else {
				throw "Bad number format";
			}
		}
		let number = startsWith(this.text, '[-+]?[0-9]*\\.?[0-9]+(?:[eE][-+]?[0-9]+)?', this.index);
		this.index += number.length;
		this.ranges[path].end = this.index;
		return parseFloat(number);
	}

	loadString(path) {
		this.index++; // jump '"'
		this.ranges[path] = {
			start: this.index,
			end: this.index
		}
		let start = this.index;
		// search end quote
		while (this.text[this.index] != '"') {
			if (this.text[this.index] == '\\' && (this.text[this.index + 1] == '"' || this.text[this.index + 1] == '\\')) {
				this.index++;
			}
			if (this.text[this.index] == '\0') {
				throw "End of string";
			}
			if (this.text[this.index] == '\n') {
				throw "New line in string";
			}
			this.index++;
		}
		let str = this.text.substring(start, this.index);
		this.ranges[path].end = this.index;
		this.index++; // jump '"'
		return str;
	}

	spaceJump() {
		this.commentJump();
		// isspace
		while ((this.text[this.index] >= '\t' && this.text[this.index] <= '\r') || this.text[this.index] == ' ') {
			this.index++;
			this.commentJump();
		}
	}

	commentJump() {
		if (this.text[this.index] == '/' && this.text[this.index + 1] == '*') {
			this.index += 2; // jump "/*"
			while (this.text[this.index] != '\0' && (this.text[this.index] != '*' || this.text[this.index + 1] != '/')) {
				this.index++; // jump character
			}
			if (this.text[this.index] != '\0') {
				this.index += 2; // jump "*/"
			}
		}
		else if (this.text[this.index] == '/' && this.text[this.index + 1] == '/') {
			while (this.text[this.index] != '\0' && this.text[this.index] != '\n') {
				this.index++; // jump character
			}
			if (this.text[this.index] != '\0') {
				this.index++; // jump '\n'
			}
		}
	}
};

class Setting {
	constructor() {
		this.uris = [];
	}
	async open(cmd = 'workbench.action.openWorkspaceSettingsFile', args = {}) {
		// open setting and focus editor
		if (!(cmd in this.uris)) {
			await vscode.commands.executeCommand(cmd, args);
			// wait executeCommand can be not focus
			await new Promise(resolve => setTimeout(resolve, 500));
			// get text from focused editor
			const editor = vscode.window.activeTextEditor;
			this.uris[cmd] = editor.document.uri;
		}
		else {
			log.debug(this.uris[cmd].toString(true));
			const doc = await vscode.workspace.openTextDocument(this.uris[cmd]);
			await vscode.window.showTextDocument(doc, { preview: false });
		}
	}
	focus(path) {
		// get text from focused editor
		const editor = vscode.window.activeTextEditor;
		const text = editor.document.getText();

		let jsoncSetting = new JsoncSettingParser(text);
		if (path in jsoncSetting.ranges) {
			editor.selection = new vscode.Selection(editor.document.positionAt(jsoncSetting.ranges[path].start), editor.document.positionAt(jsoncSetting.ranges[path].end));
			editor.revealRange(new vscode.Range(editor.document.positionAt(jsoncSetting.ranges[path].start), editor.document.positionAt(jsoncSetting.ranges[path].end)), vscode.TextEditorRevealType.InCenter)
		}
		else {
			throw `"${path}" path not found on json setting`;
		}
	}
}; // class JsonSetting

class Manager {
	constructor(context) {
		this.context = context;
		this.configuration = vscode.workspace.getConfiguration(extensionId);
		this.scopeManager = new ScopeManager(this.configuration);
		this.setting = new Setting();
		this.quickpick = new QuickPick(this.scopeManager, this.setting);
	}

	/**
	 * Add quickpick actions on context
	 */
	subscriptionsQuickPick() {
		manager.context.subscriptions.push(
			vscode.commands.registerCommand('highlight.regex.choose.names', () => {
				log.debug('command: highlight.regex.choose.names');
				manager.quickpick.updateItems(vscode.window.activeTextEditor);
				log.debug('quickpick: show');
				manager.quickpick.visible = true;
				manager.quickpick.quickpick.show();
			})
		);
	}

	/**
	 * Add toggle command on context
	 */
	subscriptionsToggle() {
		manager.context.subscriptions.push(
			vscode.commands.registerCommand('highlight.regex.toggle', () => {
				log.debug('command: highlight.regex.toggle');
				for (const scopeKey in manager.scopeManager.map) {
					manager.scopeManager.map[scopeKey].toggleDecorations();
				}
			})
		);
		manager.context.subscriptions.push(
			vscode.commands.registerCommand('highlight.regex.user.toggle', () => {
				log.debug('command: highlight.regex.user.toggle');
				manager.scopeManager.user.toggleDecorations();
			})
		);
		manager.context.subscriptions.push(
			vscode.commands.registerCommand('highlight.regex.remote.toggle', () => {
				log.debug('command: highlight.regex.remote.toggle');
				manager.scopeManager.remote.toggleDecorations();
			})
		);
		manager.context.subscriptions.push(
			vscode.commands.registerCommand('highlight.regex.workspace.toggle', () => {
				log.debug('command: highlight.regex.workspace.toggle');
				manager.scopeManager.workspace.toggleDecorations();
			})
		);
	}

	/**
	 * Add header view commands buttons on context
	 */
	subscriptionsHeaderView() {
		//
		// user
		//
		manager.context.subscriptions.push(manager.scopeManager.user.view);
		manager.context.subscriptions.push(
			vscode.commands.registerCommand('highlight.regex.user.addEntry', async (e) => {
				log.debug('command: highlight.regex.user.addEntry');
				await manager.scopeManager.user.updateConfiguration();
				await vscode.commands.executeCommand('workbench.action.openWorkspaceSettingsFile',
					{
						revealSetting: {
							key: manager.scopeManager.user.propertyName,
							edit: true
						}
					}
				);
				// wait executeCommand can be not focus
				await new Promise(resolve => setTimeout(resolve, 500));
				const editor = vscode.window.activeTextEditor;
				let next = manager.scopeManager.user.regexes.length > 0 ? ',' : '';
				let snippet = JSON.parse(JSON.stringify(manager.configuration.defaultAddSnippet));
				if (typeof snippet !== 'string') {
					snippet = snippet.join('\n');
				}
				editor.insertSnippet(new vscode.SnippetString(`${snippet}${next}`));
			})
		);
		manager.context.subscriptions.push(
			vscode.commands.registerCommand('highlight.regex.user.refreshEntries', (e) => {
				log.debug('command: highlight.regex.user.refreshEntries');
				manager.scopeManager.user.loadFromConfiguration();
			})
		);
		manager.context.subscriptions.push(
			vscode.commands.registerCommand('highlight.regex.user.collapseAll', (e) => {
				log.debug('command: highlight.regex.user.collapseAll');
				manager.scopeManager.user.treeDataProvider.collapseAll();
			})
		);
		//
		// workspace
		//
		manager.context.subscriptions.push(manager.scopeManager.workspace.view);
		manager.context.subscriptions.push(
			vscode.commands.registerCommand('highlight.regex.workspace.addEntry', async (e) => {
				log.debug('command: highlight.regex.workspace.addEntry');
				await manager.scopeManager.workspace.updateConfiguration();
				await vscode.commands.executeCommand('workbench.action.openWorkspaceSettingsFile',
					{
						revealSetting: {
							key: manager.scopeManager.workspace.propertyName,
							edit: true
						}
					}
				);
				// wait executeCommand can be not focus
				await new Promise(resolve => setTimeout(resolve, 500));
				const editor = vscode.window.activeTextEditor;
				let next = manager.scopeManager.workspace.regexes.length > 0 ? ',' : '';
				let snippet = JSON.parse(JSON.stringify(manager.configuration.defaultAddSnippet));
				if (typeof snippet !== 'string') {
					snippet = snippet.join('\n');
				}
				editor.insertSnippet(new vscode.SnippetString(`${snippet}${next}`));
			})
		);
		manager.context.subscriptions.push(
			vscode.commands.registerCommand('highlight.regex.workspace.refreshEntries', (e) => {
				log.debug('command: highlight.regex.workspace.refreshEntries');
				manager.scopeManager.workspace.loadFromConfiguration();
			})
		);
		manager.context.subscriptions.push(
			vscode.commands.registerCommand('highlight.regex.workspace.collapseAll', (e) => {
				log.debug('command: highlight.regex.workspace.collapseAll');
				manager.scopeManager.workspace.treeDataProvider.collapseAll();
			})
		);
	}

	/**
	 * Add item view commands buttons on context
	 */
	subscriptionsItemView() {
		//
		// user
		//
		manager.context.subscriptions.push(
			vscode.commands.registerCommand('highlight.regex.user.editEntry', async (e) => {
				log.debug('command: highlight.regex.user.editEntry');
				try {
					await manager.scopeManager.user.updateConfiguration();
					await manager.setting.open('workbench.action.openWorkspaceSettingsFile');
					manager.setting.focus(e.path);
				}
				catch (error) {
					log.error(`command: highlight.regex.user.editEntry: ${error.toString()}`);
				}
			})
		);
		manager.context.subscriptions.push(
			vscode.commands.registerCommand('highlight.regex.user.deleteEntry', async (e) => {
				log.debug('command: highlight.regex.user.deleteEntry');
				await manager.scopeManager.user.updateConfiguration();
				// remove root path
				let path = e.path.substring('/highlight.regex.regexes/'.length);

				let deletePath = (path, configuration) => {
					// split path
					let i = 0;
					for (; i < path.length; i++) {
						if (path[i] == '/' && i > 0 && path[i - 1] != '\\') {
							break;
						}
					}
					let key = path.substring(0, i);
					if (key[0] == '[' && key[key.length - 1] == ']') {
						key = parseInt(key.substring(1, key.length - 1));
					}
					if (i != path.length) {
						if (!(key in configuration)) {
							log.debug(`${key} not found on ${configuration}`);
						}
						deletePath(path.substring(i + 1), configuration[key]);
						return;
					}
					if (Array.isArray(configuration)) {
						configuration = configuration.splice(key, 1);
					}
					else {
						delete configuration[key];
					}
				}
				deletePath(path, manager.scopeManager.user.regexes);
				manager.scopeManager.user.treeDataProvider.loadConfigurations();
				manager.scopeManager.user.treeDataProvider.refresh();
				manager.scopeManager.user.resetDecorations();
				manager.scopeManager.user.updateDecorations();
				manager.scopeManager.user.updateConfiguration();
			})
		);
		manager.context.subscriptions.push(
			vscode.commands.registerCommand('highlight.regex.user.moveUpEntry', async (e) => {
				log.debug('command: highlight.regex.user.moveUpEntry');
				await manager.scopeManager.user.updateConfiguration();
				// hide quickpick if visible
				if (manager.quickpick.visible) {
					manager.quickpick.quickpick.hide();
				}
				let index = manager.scopeManager.user.moveUpItem(e.index);
				// select item after move
				manager.scopeManager.user.tree.reveal(
					manager.scopeManager.user.treeDataProvider.items[index],
					{ select: true }
				);
			})
		);
		manager.context.subscriptions.push(
			vscode.commands.registerCommand('highlight.regex.user.moveDownEntry', async (e) => {
				log.debug('command: highlight.regex.user.moveDownEntry');
				await manager.scopeManager.user.updateConfiguration();
				// hide quickpick if visible
				if (manager.quickpick.visible) {
					manager.quickpick.quickpick.hide();
				}
				let index = manager.scopeManager.user.moveDownItem(e.index);
				// select item after move
				manager.scopeManager.user.tree.reveal(
					manager.scopeManager.user.treeDataProvider.items[index],
					{ select: true }
				);
			})
		);
		manager.context.subscriptions.push(
			vscode.commands.registerCommand('highlight.regex.user.copyToWorkspace', (e) => {
				log.debug('command: highlight.regex.user.copyToWorkspace');
				// hide quickpick if visible
				if (manager.quickpick.visible) {
					manager.quickpick.quickpick.hide();
				}
				// push user item to workspace
				let regex = manager.scopeManager.user.regexes[e.index];
				manager.scopeManager.workspace.regexes.push(regex);
				let index = manager.scopeManager.workspace.regexes.length - 1;
				manager.scopeManager.workspace.treeDataProvider.loadConfigurations();
				manager.scopeManager.workspace.treeDataProvider.refresh();
				manager.scopeManager.workspace.updateDecorations();
				manager.scopeManager.workspace.updateConfiguration();
				// select item after copy
				manager.scopeManager.workspace.tree.reveal(
					manager.scopeManager.workspace.treeDataProvider.items[index],
					{ select: true }
				);
			})
		);
		//
		// workspace
		//
		manager.context.subscriptions.push(
			vscode.commands.registerCommand('highlight.regex.workspace.editEntry', async (e) => {
				log.debug('command: highlight.regex.workspace.editEntry');
				try {
					await manager.scopeManager.workspace.updateConfiguration();
					await manager.setting.open('workbench.action.openWorkspaceSettingsFile');
					manager.setting.focus(e.path);
				}
				catch (error) {
					log.error(`command: highlight.regex.workspace.editEntry: ${error.toString()}`);
				}
			})
		);
		manager.context.subscriptions.push(
			vscode.commands.registerCommand('highlight.regex.workspace.deleteEntry', async (e) => {
				log.debug('command: highlight.regex.workspace.deleteEntry');
				await manager.scopeManager.workspace.updateConfiguration();
				// remove root path
				let path = e.path.substring('/highlight.regex.workspace.regexes/'.length);

				let deletePath = (path, configuration) => {
					// split path
					let i = 0;
					for (; i < path.length; i++) {
						if (path[i] == '/' && i > 0 && path[i - 1] != '\\') {
							break;
						}
					}
					let key = path.substring(0, i);
					if (key[0] == '[' && key[key.length - 1] == ']') {
						key = parseInt(key.substring(1, key.length - 1));
					}
					if (i != path.length) {
						if (!(key in configuration)) {
							log.debug(`${key} not found on ${configuration}`);
						}
						deletePath(path.substring(i + 1), configuration[key]);
						return;
					}
					if (Array.isArray(configuration)) {
						configuration = configuration.splice(key, 1);
					}
					else {
						delete configuration[key];
					}
				}
				deletePath(path, manager.scopeManager.workspace.regexes);
				manager.scopeManager.workspace.treeDataProvider.loadConfigurations();
				manager.scopeManager.workspace.treeDataProvider.refresh();
				manager.scopeManager.workspace.resetDecorations();
				manager.scopeManager.workspace.updateDecorations();
				manager.scopeManager.workspace.updateConfiguration();
			})
		);
		manager.context.subscriptions.push(
			vscode.commands.registerCommand('highlight.regex.workspace.moveUpEntry', async (e) => {
				log.debug('command: highlight.regex.workspace.moveUpEntry');
				await manager.scopeManager.workspace.updateConfiguration();
				// hide quickpick if visible
				if (manager.quickpick.visible) {
					manager.quickpick.quickpick.hide();
				}
				let index = manager.scopeManager.workspace.moveUpItem(e.index);
				// select item after move
				manager.scopeManager.workspace.tree.reveal(
					manager.scopeManager.workspace.treeDataProvider.items[index],
					{ select: true }
				);
			})
		);
		manager.context.subscriptions.push(
			vscode.commands.registerCommand('highlight.regex.workspace.moveDownEntry', async (e) => {
				log.debug('command: highlight.regex.workspace.moveDownEntry');
				await manager.scopeManager.workspace.updateConfiguration();
				// hide quickpick if visible
				if (manager.quickpick.visible) {
					manager.quickpick.quickpick.hide();
				}
				let index = manager.scopeManager.workspace.moveDownItem(e.index);
				// select item after move
				manager.scopeManager.workspace.tree.reveal(
					manager.scopeManager.workspace.treeDataProvider.items[index],
					{ select: true }
				);
			})
		);
		manager.context.subscriptions.push(
			vscode.commands.registerCommand('highlight.regex.workspace.copyToUser', (e) => {
				log.debug('command: highlight.regex.user.copyToWorkspace');
				// hide quickpick if visible
				if (manager.quickpick.visible) {
					manager.quickpick.quickpick.hide();
				}
				// push user item to user
				let regex = manager.scopeManager.workspace.regexes[e.index];
				manager.scopeManager.user.regexes.push(regex);
				let index = manager.scopeManager.user.regexes.length - 1;
				manager.scopeManager.user.treeDataProvider.loadConfigurations();
				manager.scopeManager.user.treeDataProvider.refresh();
				manager.scopeManager.user.updateDecorations();
				manager.scopeManager.user.updateConfiguration();
				// select item after copy
				manager.scopeManager.user.tree.reveal(
					manager.scopeManager.user.treeDataProvider.items[index],
					{ select: true }
				);
			})
		);
	}
}; // class Manager

function activate(context) {
	// initialize global log
	log = vscode.window.createOutputChannel(extensionName, { log: true });
	manager = new Manager(context);
	manager.subscriptionsQuickPick();
	manager.subscriptionsToggle();
	manager.subscriptionsHeaderView();
	manager.subscriptionsItemView();

	// first update visible editors
	for (const textEditor of vscode.window.visibleTextEditors) {
		for (const scopeKey in manager.scopeManager.map) {
			manager.scopeManager.map[scopeKey].parser.updateDecorations(textEditor);
		}
	}

	// event configuration change
	vscode.workspace.onDidChangeConfiguration(event => {
		log.debug('event: onDidChangeConfiguration');
		manager.configuration = vscode.workspace.getConfiguration(extensionId);
		for (const scopeKey in manager.scopeManager.map) {
			log.debug(`event: onDidChangeConfiguration: ${manager.scopeManager.map[scopeKey].propertyName} updated`);
			// update title of tree
			if (event.affectsConfiguration(manager.scopeManager.map[scopeKey].propertyName)) {
				manager.scopeManager.map[scopeKey].updateTreeTitle();
				if (manager.scopeManager.map[scopeKey].configurationChangeEvent) {
					manager.scopeManager.map[scopeKey].resetDecorations();
					manager.scopeManager.map[scopeKey].loadFromConfiguration();
					manager.scopeManager.map[scopeKey].updateDecorations();
				}
			}
		}
	});

	// event change visible editors
	let lastVisibleEditors = [];
	vscode.window.onDidChangeVisibleTextEditors(visibleTextEditors => {
		if (visibleTextEditors.length > 0) {
			log.debug(`event: onDidChangeVisibleTextEditors: ${visibleTextEditors.length} editor(s):`);
			for (const uriEditor of visibleTextEditors.map((editor) => editor.document.uri.toString(true))) {
				log.debug(`- ${uriEditor}`);
			}
		}
		let newVisibleEditors = [];
		for (const textEditor of visibleTextEditors) {
			const key = textEditor.document.uri.toString(true) + textEditor.viewColumn;
			newVisibleEditors[key] = true;
			// if new visible editor
			if (!(key in lastVisibleEditors)) {
				for (const scopeKey in manager.scopeManager.map) {
					manager.scopeManager.map[scopeKey].parser.cacheDecorations(textEditor);
				}
			}
		}
		lastVisibleEditors = newVisibleEditors;
	});

	// event change text content
	vscode.workspace.onDidChangeTextDocument(event => {
		const openEditors = vscode.window.visibleTextEditors.filter(
			(editor) => editor.document.uri === event.document.uri
		);
		let isNotLogOuput = false;
		for (const textEditor of openEditors) {
			if ('output' != textEditor.document.uri.scheme || !textEditor.document.uri.toString(true).includes('Highlight regex')) {
				isNotLogOuput = true;
				triggerUpdate(textEditor);
			}
		}
		if (isNotLogOuput && openEditors.length > 0) {
			log.debug(`event: onDidChangeTextDocument: ${openEditors.length} editor(s):`);
			for (const uriEditor of openEditors.map((editor) => editor.document.uri.toString(true))) {
				log.debug(`- ${uriEditor}`);
			}
		}
	});

	let timeoutTimer = [];
	// trigger call update decoration
	function triggerUpdate(editor) {
		let key = editor.document.uri.toString(true) + editor.viewColumn;
		if (key in timeoutTimer && timeoutTimer[key]) {
			clearTimeout(timeoutTimer[key]);
		}
		timeoutTimer[key] = setTimeout(() => {
			for (const scopeKey in manager.scopeManager.map) {
				manager.scopeManager.map[scopeKey].parser.updateDecorations(editor);
			}
		}, manager.configuration.delay);
	}
}

function desactivate() { }

module.exports = { activate, desactivate }