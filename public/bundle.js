var app = (function () {
	'use strict';

	function noop() {}

	function add_location(element, file, line, column, char) {
		element.__svelte_meta = {
			loc: { file, line, column, char }
		};
	}

	function run(fn) {
		return fn();
	}

	function blank_object() {
		return Object.create(null);
	}

	function run_all(fns) {
		fns.forEach(run);
	}

	function is_function(thing) {
		return typeof thing === 'function';
	}

	function safe_not_equal(a, b) {
		return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
	}

	function append(target, node) {
		target.appendChild(node);
	}

	function insert(target, node, anchor) {
		target.insertBefore(node, anchor || null);
	}

	function detach(node) {
		node.parentNode.removeChild(node);
	}

	function element(name) {
		return document.createElement(name);
	}

	function text(data) {
		return document.createTextNode(data);
	}

	function space() {
		return text(' ');
	}

	function listen(node, event, handler, options) {
		node.addEventListener(event, handler, options);
		return () => node.removeEventListener(event, handler, options);
	}

	function children(element) {
		return Array.from(element.childNodes);
	}

	function set_data(text, data) {
		data = '' + data;
		if (text.data !== data) text.data = data;
	}

	let current_component;

	function set_current_component(component) {
		current_component = component;
	}

	const dirty_components = [];

	const resolved_promise = Promise.resolve();
	let update_scheduled = false;
	const binding_callbacks = [];
	const render_callbacks = [];
	const flush_callbacks = [];

	function schedule_update() {
		if (!update_scheduled) {
			update_scheduled = true;
			resolved_promise.then(flush);
		}
	}

	function add_render_callback(fn) {
		render_callbacks.push(fn);
	}

	function flush() {
		const seen_callbacks = new Set();

		do {
			// first, call beforeUpdate functions
			// and update components
			while (dirty_components.length) {
				const component = dirty_components.shift();
				set_current_component(component);
				update(component.$$);
			}

			while (binding_callbacks.length) binding_callbacks.shift()();

			// then, once components are updated, call
			// afterUpdate functions. This may cause
			// subsequent updates...
			while (render_callbacks.length) {
				const callback = render_callbacks.pop();
				if (!seen_callbacks.has(callback)) {
					callback();

					// ...so guard against infinite loops
					seen_callbacks.add(callback);
				}
			}
		} while (dirty_components.length);

		while (flush_callbacks.length) {
			flush_callbacks.pop()();
		}

		update_scheduled = false;
	}

	function update($$) {
		if ($$.fragment) {
			$$.update($$.dirty);
			run_all($$.before_render);
			$$.fragment.p($$.dirty, $$.ctx);
			$$.dirty = null;

			$$.after_render.forEach(add_render_callback);
		}
	}

	function destroy_block(block, lookup) {
		block.d(1);
		lookup.delete(block.key);
	}

	function update_keyed_each(old_blocks, changed, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
		let o = old_blocks.length;
		let n = list.length;

		let i = o;
		const old_indexes = {};
		while (i--) old_indexes[old_blocks[i].key] = i;

		const new_blocks = [];
		const new_lookup = new Map();
		const deltas = new Map();

		i = n;
		while (i--) {
			const child_ctx = get_context(ctx, list, i);
			const key = get_key(child_ctx);
			let block = lookup.get(key);

			if (!block) {
				block = create_each_block(key, child_ctx);
				block.c();
			} else if (dynamic) {
				block.p(changed, child_ctx);
			}

			new_lookup.set(key, new_blocks[i] = block);

			if (key in old_indexes) deltas.set(key, Math.abs(i - old_indexes[key]));
		}

		const will_move = new Set();
		const did_move = new Set();

		function insert(block) {
			if (block.i) block.i(1);
			block.m(node, next);
			lookup.set(block.key, block);
			next = block.first;
			n--;
		}

		while (o && n) {
			const new_block = new_blocks[n - 1];
			const old_block = old_blocks[o - 1];
			const new_key = new_block.key;
			const old_key = old_block.key;

			if (new_block === old_block) {
				// do nothing
				next = new_block.first;
				o--;
				n--;
			}

			else if (!new_lookup.has(old_key)) {
				// remove old block
				destroy(old_block, lookup);
				o--;
			}

			else if (!lookup.has(new_key) || will_move.has(new_key)) {
				insert(new_block);
			}

			else if (did_move.has(old_key)) {
				o--;

			} else if (deltas.get(new_key) > deltas.get(old_key)) {
				did_move.add(new_key);
				insert(new_block);

			} else {
				will_move.add(old_key);
				o--;
			}
		}

		while (o--) {
			const old_block = old_blocks[o];
			if (!new_lookup.has(old_block.key)) destroy(old_block, lookup);
		}

		while (n) insert(new_blocks[n - 1]);

		return new_blocks;
	}

	function mount_component(component, target, anchor) {
		const { fragment, on_mount, on_destroy, after_render } = component.$$;

		fragment.m(target, anchor);

		// onMount happens after the initial afterUpdate. Because
		// afterUpdate callbacks happen in reverse order (inner first)
		// we schedule onMount callbacks before afterUpdate callbacks
		add_render_callback(() => {
			const new_on_destroy = on_mount.map(run).filter(is_function);
			if (on_destroy) {
				on_destroy.push(...new_on_destroy);
			} else {
				// Edge case - component was destroyed immediately,
				// most likely as a result of a binding initialising
				run_all(new_on_destroy);
			}
			component.$$.on_mount = [];
		});

		after_render.forEach(add_render_callback);
	}

	function destroy(component, detaching) {
		if (component.$$) {
			run_all(component.$$.on_destroy);
			component.$$.fragment.d(detaching);

			// TODO null out other refs, including component.$$ (but need to
			// preserve final state?)
			component.$$.on_destroy = component.$$.fragment = null;
			component.$$.ctx = {};
		}
	}

	function make_dirty(component, key) {
		if (!component.$$.dirty) {
			dirty_components.push(component);
			schedule_update();
			component.$$.dirty = blank_object();
		}
		component.$$.dirty[key] = true;
	}

	function init(component, options, instance, create_fragment, not_equal$$1, prop_names) {
		const parent_component = current_component;
		set_current_component(component);

		const props = options.props || {};

		const $$ = component.$$ = {
			fragment: null,
			ctx: null,

			// state
			props: prop_names,
			update: noop,
			not_equal: not_equal$$1,
			bound: blank_object(),

			// lifecycle
			on_mount: [],
			on_destroy: [],
			before_render: [],
			after_render: [],
			context: new Map(parent_component ? parent_component.$$.context : []),

			// everything else
			callbacks: blank_object(),
			dirty: null
		};

		let ready = false;

		$$.ctx = instance
			? instance(component, props, (key, value) => {
				if ($$.ctx && not_equal$$1($$.ctx[key], $$.ctx[key] = value)) {
					if ($$.bound[key]) $$.bound[key](value);
					if (ready) make_dirty(component, key);
				}
			})
			: props;

		$$.update();
		ready = true;
		run_all($$.before_render);
		$$.fragment = create_fragment($$.ctx);

		if (options.target) {
			if (options.hydrate) {
				$$.fragment.l(children(options.target));
			} else {
				$$.fragment.c();
			}

			if (options.intro && component.$$.fragment.i) component.$$.fragment.i();
			mount_component(component, options.target, options.anchor);
			flush();
		}

		set_current_component(parent_component);
	}

	class SvelteComponent {
		$destroy() {
			destroy(this, true);
			this.$destroy = noop;
		}

		$on(type, callback) {
			const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
			callbacks.push(callback);

			return () => {
				const index = callbacks.indexOf(callback);
				if (index !== -1) callbacks.splice(index, 1);
			};
		}

		$set() {
			// overridden by instance, if it has props
		}
	}

	class SvelteComponentDev extends SvelteComponent {
		constructor(options) {
			if (!options || (!options.target && !options.$$inline)) {
				throw new Error(`'target' is a required option`);
			}

			super();
		}

		$destroy() {
			super.$destroy();
			this.$destroy = () => {
				console.warn(`Component was already destroyed`); // eslint-disable-line no-console
			};
		}
	}

	const copyTextByElement = data =>
	  new Promise((resolve, reject) => {
	    const textarea = document.createElement('textarea');
	    textarea.value = data;
	    document.body.appendChild(textarea);
	    textarea.select();
	    document.execCommand('copy');
	    resolve(document.body.removeChild(textarea));
	  });
	const setClipboard = async data => {
	  if (
	    navigator &&
	    navigator.clipboard &&
	    typeof navigator.clipboard.writeText === 'function'
	  ) {
	    await navigator.clipboard.writeText(data);
	  } else {
	    await copyTextByElement(data);
	  }
	};

	const getFieldsFromTemplate = template =>
	  template
	    .split('\n')
	    .map(field => field.trim())
	    .filter(Boolean)
	    .map(field => field.replace(':', ''));

	const sleep = (timeout = 1000) =>
	  new Promise(resolve => setTimeout(resolve, timeout));

	/* App.svelte generated by Svelte v3.3.0 */

	const file = "App.svelte";

	function get_each_context(ctx, list, i) {
		const child_ctx = Object.create(ctx);
		child_ctx.notification = list[i];
		return child_ctx;
	}

	function get_each_context_1(ctx, list, i) {
		const child_ctx = Object.create(ctx);
		child_ctx.field = list[i];
		return child_ctx;
	}

	// (127:2) {:else}
	function create_else_block(ctx) {
		var h1;

		return {
			c: function create() {
				h1 = element("h1");
				h1.textContent = "No Results";
				add_location(h1, file, 127, 4, 2831);
			},

			m: function mount(target, anchor) {
				insert(target, h1, anchor);
			},

			d: function destroy(detaching) {
				if (detaching) {
					detach(h1);
				}
			}
		};
	}

	// (124:2) {#each fields as field (field)}
	function create_each_block_1(key_1, ctx) {
		var label, t0_value = ctx.field, t0, label_for_value, t1, input, input_placeholder_value, dispose;

		return {
			key: key_1,

			first: null,

			c: function create() {
				label = element("label");
				t0 = text(t0_value);
				t1 = space();
				input = element("input");
				label.htmlFor = label_for_value = ctx.field;
				label.className = "svelte-nbjemk";
				add_location(label, file, 124, 4, 2718);
				input.placeholder = input_placeholder_value = ctx.field;
				input.className = "svelte-nbjemk";
				add_location(input, file, 125, 4, 2757);
				dispose = listen(input, "input", ctx.handleInput(ctx.field));
				this.first = label;
			},

			m: function mount(target, anchor) {
				insert(target, label, anchor);
				append(label, t0);
				insert(target, t1, anchor);
				insert(target, input, anchor);
			},

			p: function update(changed, new_ctx) {
				ctx = new_ctx;
				if ((changed.fields) && t0_value !== (t0_value = ctx.field)) {
					set_data(t0, t0_value);
				}

				if ((changed.fields) && label_for_value !== (label_for_value = ctx.field)) {
					label.htmlFor = label_for_value;
				}

				if ((changed.fields) && input_placeholder_value !== (input_placeholder_value = ctx.field)) {
					input.placeholder = input_placeholder_value;
				}
			},

			d: function destroy(detaching) {
				if (detaching) {
					detach(label);
					detach(t1);
					detach(input);
				}

				dispose();
			}
		};
	}

	// (135:4) {#each notifications as notification (notification.id)}
	function create_each_block(key_1, ctx) {
		var div, t0_value = ctx.notification.message, t0, t1;

		return {
			key: key_1,

			first: null,

			c: function create() {
				div = element("div");
				t0 = text(t0_value);
				t1 = space();
				div.className = "notification svelte-nbjemk";
				add_location(div, file, 135, 6, 3136);
				this.first = div;
			},

			m: function mount(target, anchor) {
				insert(target, div, anchor);
				append(div, t0);
				append(div, t1);
			},

			p: function update(changed, ctx) {
				if ((changed.notifications) && t0_value !== (t0_value = ctx.notification.message)) {
					set_data(t0, t0_value);
				}
			},

			d: function destroy(detaching) {
				if (detaching) {
					detach(div);
				}
			}
		};
	}

	function create_fragment(ctx) {
		var main, h30, t1, each_blocks_1 = [], each0_lookup = new Map(), t2, button, t4, pre, t5, t6, h31, t8, textarea, t9, div, each_blocks = [], each1_lookup = new Map(), dispose;

		var each_value_1 = ctx.fields;

		const get_key = ctx => ctx.field;

		for (var i = 0; i < each_value_1.length; i += 1) {
			let child_ctx = get_each_context_1(ctx, each_value_1, i);
			let key = get_key(child_ctx);
			each0_lookup.set(key, each_blocks_1[i] = create_each_block_1(key, child_ctx));
		}

		var each0_else = null;

		if (!each_value_1.length) {
			each0_else = create_else_block(ctx);
			each0_else.c();
		}

		var each_value = ctx.notifications;

		const get_key_1 = ctx => ctx.notification.id;

		for (var i = 0; i < each_value.length; i += 1) {
			let child_ctx = get_each_context(ctx, each_value, i);
			let key = get_key_1(child_ctx);
			each1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
		}

		return {
			c: function create() {
				main = element("main");
				h30 = element("h3");
				h30.textContent = "Your Template Fields";
				t1 = space();

				for (i = 0; i < each_blocks_1.length; i += 1) each_blocks_1[i].c();

				t2 = space();
				button = element("button");
				button.textContent = "Copy Description";
				t4 = space();
				pre = element("pre");
				t5 = text(ctx.result);
				t6 = space();
				h31 = element("h3");
				h31.textContent = "Put your template here";
				t8 = space();
				textarea = element("textarea");
				t9 = space();
				div = element("div");

				for (i = 0; i < each_blocks.length; i += 1) each_blocks[i].c();
				add_location(h30, file, 122, 2, 2650);
				button.className = "svelte-nbjemk";
				add_location(button, file, 129, 2, 2863);
				pre.className = "svelte-nbjemk";
				add_location(pre, file, 130, 2, 2922);
				add_location(h31, file, 131, 2, 2944);
				textarea.rows = "4";
				textarea.cols = "100";
				textarea.className = "svelte-nbjemk";
				add_location(textarea, file, 132, 2, 2978);
				div.className = "notifications svelte-nbjemk";
				add_location(div, file, 133, 2, 3042);
				main.className = "svelte-nbjemk";
				add_location(main, file, 121, 0, 2641);

				dispose = [
					listen(button, "click", ctx.handleClick),
					listen(textarea, "input", ctx.textarea_input_handler)
				];
			},

			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},

			m: function mount(target, anchor) {
				insert(target, main, anchor);
				append(main, h30);
				append(main, t1);

				for (i = 0; i < each_blocks_1.length; i += 1) each_blocks_1[i].m(main, null);

				if (each0_else) {
					each0_else.m(main, null);
				}

				append(main, t2);
				append(main, button);
				append(main, t4);
				append(main, pre);
				append(pre, t5);
				append(main, t6);
				append(main, h31);
				append(main, t8);
				append(main, textarea);

				textarea.value = ctx.currentTemplate;

				append(main, t9);
				append(main, div);

				for (i = 0; i < each_blocks.length; i += 1) each_blocks[i].m(div, null);
			},

			p: function update(changed, ctx) {
				const each_value_1 = ctx.fields;
				each_blocks_1 = update_keyed_each(each_blocks_1, changed, get_key, 1, ctx, each_value_1, each0_lookup, main, destroy_block, create_each_block_1, t2, get_each_context_1);

				if (each_value_1.length) {
					if (each0_else) {
						each0_else.d(1);
						each0_else = null;
					}
				} else if (!each0_else) {
					each0_else = create_else_block(ctx);
					each0_else.c();
					each0_else.m(main, t2);
				}

				if (changed.result) {
					set_data(t5, ctx.result);
				}

				if (changed.currentTemplate) textarea.value = ctx.currentTemplate;

				const each_value = ctx.notifications;
				each_blocks = update_keyed_each(each_blocks, changed, get_key_1, 1, ctx, each_value, each1_lookup, div, destroy_block, create_each_block, null, get_each_context);
			},

			i: noop,
			o: noop,

			d: function destroy(detaching) {
				if (detaching) {
					detach(main);
				}

				for (i = 0; i < each_blocks_1.length; i += 1) each_blocks_1[i].d();

				if (each0_else) each0_else.d();

				for (i = 0; i < each_blocks.length; i += 1) each_blocks[i].d();

				run_all(dispose);
			}
		};
	}

	const notificationTimeout = 5000;

	const notificationCopyMessage =
	    "Description copied to clipboard. You can now paste it into Siebel";

	function instance($$self, $$props, $$invalidate) {
		let notifications = [];
	  let currentTemplate = `name:
password:
  `;
	  const cachedFunctions = new Map();
	  const handleInput = field => {
	    if (cachedFunctions.has(field)) return cachedFunctions.get(field);
	    const handler = event => {
	      map.set(field, event.target.value);
	      $$invalidate('map', map = new Map(map));
	    };
	    cachedFunctions.set(field, handler);
	    return handler;
	  };

	  const handleClick = async () => {
	    await setClipboard(result);
	    const notification = {
	      id: +new Date(),
	      message: notificationCopyMessage
	    };
	    $$invalidate('notifications', notifications = [notification, ...notifications]);
	    await sleep(notificationTimeout);
	    $$invalidate('notifications', notifications = notifications.filter(n => n.id !== notification.id));
	  };

		function textarea_input_handler() {
			currentTemplate = this.value;
			$$invalidate('currentTemplate', currentTemplate);
		}

		let fields, map, fieldsAndValues, result;

		$$self.$$.update = ($$dirty = { currentTemplate: 1, fields: 1, map: 1, fieldsAndValues: 1 }) => {
			if ($$dirty.currentTemplate) { $$invalidate('fields', fields = getFieldsFromTemplate(currentTemplate)); }
			if ($$dirty.fields) { $$invalidate('map', map = new Map(fields.map(field => [field, ""]))); }
			if ($$dirty.map) { $$invalidate('fieldsAndValues', fieldsAndValues = Array.from(map)); }
			if ($$dirty.fieldsAndValues) { $$invalidate('result', result = fieldsAndValues
	        .map(([key, value]) => `${key}: ${value}`)
	        .join("\n")); }
		};

		return {
			notifications,
			currentTemplate,
			handleInput,
			handleClick,
			fields,
			result,
			textarea_input_handler
		};
	}

	class App extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance, create_fragment, safe_not_equal, []);
		}
	}

	const app = new App({
	  target: document.body
	});

	return app;

}());
//# sourceMappingURL=bundle.js.map
