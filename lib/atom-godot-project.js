const GodotProject = require('./core/core')
const {TextBuffer} = require('atom')
const {join} = require('path');
const treeHelpers = require('./core/tree-sitter-helpers')

module.exports = class AtomGodotProject extends GodotProject {

	_getLangGDPkgPath() {
		if (!this.__langGDPkgPath)
			this.__langGDPkgPath = atom.packages.resolvePackagePath('lang-gdscript')
		return this.__langGDPkgPath
	}

	_getLangGDGrammar() {
		let grammar = atom.grammars.grammarForScopeName('scope.gdscript')
		if (!grammar) {
			grammar = atom.grammars.loadGrammarSync(join(
					this._getLangGDPkgPath(),
					'grammars/tree-sitter-gdscript.json'
			))
		}

		return grammar
	}

	_parseTree(buffer) {
		const grammar = this._getLangGDGrammar()
		const mode = atom.grammars.languageModeForGrammarAndBuffer(grammar, buffer)
		if (!mode)
			return null

		return mode.tree
	}

	_parseScript(path) {
		const buffer = TextBuffer.loadSync(join(this.resourcePath, path))
		return this._parseTree(buffer)
	}

	_parseSource(text) {
		const buffer = new TextBuffer({text})
		return this._parseTree(buffer)
	}

	getSymbolsOfClassSymbol(classSymbol) {
		const result = []
		const symbolCategories = [
			classSymbol.info['constants'],
			classSymbol.info['methods'],
			classSymbol.info['members'],
			classSymbol.info['classes']
		]
		for (const symbolCategory of symbolCategories) {
			for (const name in symbolCategory) {
				const symbol = symbolCategory[name]
				if (symbol.info)
					result.push(symbol)
			}
		}
		return result
	}

	getSymbols(editor, position, prefix) {
		const tree = this._parseTree(editor.getBuffer())
		if (!tree) return []

		var result

		const node = tree.rootNode.descendantForPosition(position)
		this.indexLocalScope(node)

		console.log('Position Node: ', node)

		const attribute = treeHelpers.getClosestAncestorOfNodeWithTypes(node, ['attribute'])
		if (attribute) {
			result = this._processAttribute(attribute, node, prefix)
		} else {
			switch (node.type) {
				case 'identifier':
					result = this._processIdentifier(prefix)
				default: ;
			}
		}
		
		if (!result)
			result = []
		else if (!Array.isArray(result))
			result = [result]
		return result
	}

	_processIdentifier(identifier) {
		return this.index.find(identifier)
	}

	_processAttribute(node, toNode, withPrefix) {
		let result = this.index
		let lookupText = ''

		for (const child of node.children) {
			lookupText = child.text

			if ((child.type === 'attribute_subscript') ||
			    (child.type === 'attribute_call')) {
				lookupText = treeHelpers.getFirstChildOfNodeWithType(child, 'identifier').text
			}

			if (child === toNode || child.range.containsRange(toNode.range)) {
				if (!result || result.type !== 'class')
					break

				if (toNode.type === '.') {
					result = this.getSymbolsOfClassSymbol(result)
				} else {
					let results = []
					let symbol = result
					while (symbol) {
						results = results.concat(symbol.find(lookupText))
						if (!symbol.info['inherits'])
							break
						symbol = this.index.lookup(symbol.info['inherits'])
					}
					result = results
				}

				break
			}

			if (!child.isNamed)
				continue

			result = result.lookup(lookupText)
			result = this.resolveSymbolType(result)

		}
		return result
	}

}