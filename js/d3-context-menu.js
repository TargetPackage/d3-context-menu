(function (root, factory) {
	if (typeof module === "object" && module.exports) {
		var d3 = require("d3");
		module.exports = factory(d3);
	} else if (typeof define === "function" && define.amd) {
		try {
			var d3 = require("d3");
		} catch (e) {
			d3 = root.d3;
		}

		d3.contextMenu = factory(d3);
		define([], function () {
			return d3.contextMenu;
		});
	} else if (root.d3) {
		root.d3.contextMenu = factory(root.d3);
	}
})(this, function (d3) {
	const utils = {
		noop: function () {},

		/**
		 * @param {*} value
		 * @returns {Boolean}
		 */
		isFn: function (value) {
			return typeof value === "function";
		},

		/**
		 * @param {*} value
		 * @returns {Function}
		 */
		const: function (value) {
			return function () {
				return value;
			};
		},

		/**
		 * @param {Function|*} value
		 * @param {*} [fallback]
		 * @returns {Function}
		 */
		toFactory: function (value, fallback) {
			value = value === undefined ? fallback : value;
			return utils.isFn(value) ? value : utils.const(value);
		}
	};

	// global state for d3-context-menu
	var d3ContextMenu = null;

	const closeMenu = () => {
		// global state is populated if a menu is currently opened
		if (d3ContextMenu) {
			d3.select(".d3-context-menu").remove();
			d3.select("body").on("mousedown.d3-context-menu", null);
			d3ContextMenu.boundCloseCallback();
			d3ContextMenu = null;
		}
	};

	/**
	 * Calls API method (e.g. `close`) or
	 * returns handler function for the `contextmenu` event
	 * @param {Function|Array|String} menuItems
	 * @param {Function|Object} config
	 * @returns {?Function}
	 */
	return function (menuItems, config) {
		// allow for `d3.contextMenu('close');` calls
		// to programatically close the menu
		if (menuItems === "close") {
			return closeMenu();
		}

		// for convenience, make `menuItems` a factory
		// and `config` an object
		menuItems = utils.toFactory(menuItems);

		if (utils.isFn(config)) {
			config = { onOpen: config };
		} else {
			config = config || {};
		}

		// resolve config
		const openCallback = config.onOpen || utils.noop;
		const closeCallback = config.onClose || utils.noop;
		const positionFactory = utils.toFactory(config.position);
		const themeFactory = utils.toFactory(config.theme, "d3-context-menu-theme");

		/**
		 * Context menu event handler
		 * @param {*} param1
		 * @param {*} param2
		 */
		return function (param1, param2) {
			let element = this;

			// eventOrIndex is the second argument that will be passed to
			// the context menu callbacks: for D3 6.x or above it will be
			// the event, since the global d3.event is not available.
			// For D3 5.x or below it will be the index, for backward
			// compatibility reasons.
			let event, data, index, eventOrIndex;
			if (d3.event === undefined) {
				// Using D3 6.x or above
				event = param1;
				data = param2;

				// We cannot tell the index properly in new D3 versions,
				// since it is not possible to access the original selection.
				index = undefined;
				eventOrIndex = event;
			} else {
				// Using D3 5.x or below
				event = d3.event;
				data = param1;
				index = param2;
				eventOrIndex = index;
			}

			// close any menu that's already opened
			closeMenu();

			// store close callback already bound to the correct args and scope
			d3ContextMenu = {
				boundCloseCallback: closeCallback.bind(element, data, eventOrIndex)
			};

			// create the div element that will hold the context menu
			d3.selectAll(".d3-context-menu")
				.data([1])
				.enter()
				.append("div")
				.attr("class", "d3-context-menu " + themeFactory.bind(element)(data, eventOrIndex));

			// close menu on mousedown outside
			d3.select("body").on("mousedown.d3-context-menu", closeMenu);
			d3.select("body").on("click.d3-context-menu", closeMenu);

			const parent = d3
				.selectAll(".d3-context-menu")
				.on("contextmenu", function () {
					closeMenu();
					event.preventDefault();
					event.stopPropagation();
				})
				.append("ul");

			parent.call(createNestedMenu, element);

			// the openCallback allows an action to fire before the menu is displayed
			// an example usage would be closing a tooltip
			if (openCallback.bind(element)(data, eventOrIndex) === false) {
				return;
			}

			//console.log(this.parentNode.parentNode.parentNode);//.getBoundingClientRect());   Use this if you want to align your menu from the containing element, otherwise aligns towards center of window

			// get position
			const position = positionFactory.bind(element)(data, eventOrIndex);

			const doc = document.documentElement;
			const pageWidth = window.innerWidth || doc.clientWidth;
			const pageHeight = window.innerHeight || doc.clientHeight;

			let horizontalAlignment = "left";
			let horizontalAlignmentReset = "right";
			let horizontalValue = position ? position.left : event.pageX - 2;
			if (event.pageX > pageWidth / 2) {
				horizontalAlignment = "right";
				horizontalAlignmentReset = "left";
				horizontalValue = position ? pageWidth - position.left : pageWidth - event.pageX - 2;
			}

			let verticalAlignment = "top";
			let verticalAlignmentReset = "bottom";
			let verticalValue = position ? position.top : event.pageY - 2;
			if (event.pageY > pageHeight / 2) {
				verticalAlignment = "bottom";
				verticalAlignmentReset = "top";
				verticalValue = position ? pageHeight - position.top : pageHeight - event.pageY - 2;
			}

			// display context menu
			d3.select(".d3-context-menu")
				.style(horizontalAlignment, horizontalValue + "px")
				.style(horizontalAlignmentReset, null)
				.style(verticalAlignment, verticalValue + "px")
				.style(verticalAlignmentReset, null)
				.style("display", "block");

			event.preventDefault();
			event.stopPropagation();

			function createNestedMenu(parent, root, depth = 0) {
				const resolve = (value) => {
					return utils.toFactory(value).call(root, data, eventOrIndex);
				};

				parent
					.selectAll("li")
					.data(function (d) {
						const baseData = depth === 0 ? menuItems : d.children;
						return resolve(baseData);
					})
					.enter()
					.append("li")
					.each(function (d) {
						// get value of each data
						const isDivider = !!resolve(d.divider);
						const isDisabled = !!resolve(d.disabled);
						const hasChildren = !!resolve(d.children);
						const hasAction = !!d.action;
						const hasCls = !!d.className;
						const text = isDivider ? "<hr>" : resolve(d.title);

						const listItem = d3
							.select(this)
							.classed("is-divider", isDivider)
							.classed("is-disabled", isDisabled)
							.classed("is-header", !hasChildren && !hasAction)
							.classed("is-parent", hasChildren)
							.classed(resolve(d.className), hasCls)
							.html(text)
							.on("click", function () {
								// do nothing if disabled or no action
								if (isDisabled || !hasAction) return;

								d.action.call(root, data, eventOrIndex);
								closeMenu();
							});

						if (hasChildren) {
							// create children(`next parent`) and call recursive
							const children = listItem.append("ul").classed("is-children", true);
							createNestedMenu(children, root, ++depth);
						}
					});
			}
		};
	};
});
