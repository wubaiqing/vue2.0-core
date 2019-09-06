// -------------- util --------------
function def(obj, key, val, enumerable) {
  Object.defineProperty(obj, key, {
    value: val,
    enumerable: !!enumerable,
    writable: true,
    configurable: true
  });
}


// -------------- 虚拟dom --------------
// tip: 这里的虚拟dom没有diff算法, 只是为了凑数用的
// 真实的vdom做法: 新老vnode做diff产生patches, 然后用patches修改this.$el
// 这里的vdom做法: patch里面直接修改了dom元素
    // 只能有一个子元素, 并且只要有更新, 直接用新的vnode生成dom替换老的, 不深入比较
class Vnode {
  constructor(tag, data, children, text, elm) {
    this.tag = tag;
    this.data = data;
    this.children = children;
    this.text = text;
    this.elm = elm;
  }
}

// 制造一个vnode节点
function createVnode(tag, data, children) {
  function createTextVNode(val) {
    return new Vnode(undefined, undefined, undefined, String(val))
  }

  function normalizeChildren(children) {
    if (typeof children === 'string') {
      return [createTextVNode(children)]
    }
    return children
  }

  return new Vnode(tag, data, normalizeChildren(children), undefined, undefined);
}

// 根据vnode生成dom元素
function getElm(vnode) {
  var tag = vnode.tag;
  var data = vnode.data;
  var children = vnode.children;

  let elm

  if (tag !== undefined) {
    elm = document.createElement(tag);

    if (data.attrs !== undefined) {
      var attrs = data.attrs;
      for (var key in attrs) {
        elm.setAttribute(key, attrs[key])
      }
    }

    if (children) {
      for (var i = 0; i < children.length; ++i) {
        elm.appendChild(getElm(children[i]));
      }
    }
  } else {
    elm = document.createTextNode(vnode.text);
  }

  return elm;
}


// -------------- 数据代理 --------------
function proxy($data, vm) {
  Object.keys($data).forEach((key) => {
    Object.defineProperty(vm, key, {
      configurable: true,
      enumerable: true,
      get: function () {
        return $data[key]
      },
      set: function (val) {
        $data[key] = val
      }
    })
  })
}


// -------------- 数组原型重写 --------------
var arrayProto = Array.prototype;
var arrayMethods = Object.create(arrayProto);

var methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
];

methodsToPatch.forEach(function (method) {
  def(arrayMethods, method, function () {
    // 修改数组, 获取返回值
    var result = arrayProto[method].apply(this, arguments);
    // 用最新数据派发更新
    this.__ob__.dep.notify();
    return result
  });
});


// -------------- 观察数据 --------------
// 观测一个对象/数组, 不是对象/数组就返回
function observe(value) {
  if(typeof value !== 'object') return 
  return new Observer(value)
}

class Observer {
  constructor(value) {
    this.dep = new Dep();
    def(value, '__ob__', this);
    if (Array.isArray(value)) {
      value.__proto__ = arrayMethods
      this.observeArray(value);
    } else {
      this.observeObj(value);
    }
  }

  observeArray(items) {
    items.forEach((item) => {
      observe(item);
    })
  }

  observeObj(obj) {
    Object.keys(obj).forEach((key) => {
      defineReactive(obj, key, obj[key])
    })
  }
}

function defineReactive(obj, key, val) {
  var dep = new Dep();
  const ob = observe(val)
  Object.defineProperty(obj, key, {
    // 只要读取obj[key], 就会将watcher放进dep
    get: function () {
      if (Dep.target) {
        Dep.target.addToDep(dep);
        if (ob) {
          Dep.target.addToDep(ob.dep)
        }
      }
      return val
    },
    // 只修改obj[key], 就会执行所有watcher
    set: function (newVal) {
      if (newVal === val) return;
      val = newVal;
      dep.notify();
    }
  })
}


// -------------- 发布订阅 --------------
var uid$1 = 0;

class Dep {
  constructor() {
    this.subs = [];
    this.id = uid$1++;

    Dep.target = null
  }

  addSub(sub) {
    this.subs.push(sub)
  }

  notify() {
    // 这里的sub就是watcher
    this.subs.forEach((sub) => {
      sub.update()
    })
  }
}

class Watcher {
  /**
   * 最基础的实现下: exprOrFn就是组件的render函数
   * 在用户可以传入watch配置时, exprOrFn是data的属性, cb是回调函数
   */
  constructor(vm, exprOrFn, cb) {
    this.vm = vm;
    this.getter = exprOrFn;
    this.depIds = [];
    // 首次实例化执行一次, 后面更新还会再执行
    this.get();
  }

  // 主要就是vue的update操作, 制造vnode, 更新dom, 同时依赖收集
  get() {
    Dep.target = this;
    /** 
     * 这里内部调用了render函数, render函数中对this.message的读取触发了message的get钩子
     * get钩子中,将this(当前的watcher放进了message对应的dep中)
    */
    this.getter.call(this.vm);
    Dep.target = null;
  }

  update() {
    // 此时要重新执行依赖收集的操作, 应对v-if的情况
    this.get();
  }

  addToDep(dep) {
    var id = dep.id;
    // 如果判断加入到这个dep里面了, 就不重复添加
    if (!this.depIds.includes(id)) {
      this.depIds.push(id);
      dep.addSub(this);
    }
  }
}


// -------------- vue主流程 --------------
class Vue {
  constructor(options) {
    this.$options = options;

    this.initData();
    this.mount(document.querySelector(options.el))
  }

  initData() {
    this.$data = this.$options.data;

    proxy(this.$data, this)
    observe(this.$data)
  }

  mount(el) {
    this.$el = el;
    new Watcher(this, function () {
      // 用当前最新的数据执行render函数返回新vnode, 更新当前dom
      this.update();
    });
  }

  // 直接用新vnode生成dom, 替换当前dom
  update() {
    // 执行组件的render函数获取新dom树
    const newVnode = this.$options.render.call(this, createVnode)

    // 更新视图, 更新$el
    const newEl = getElm(newVnode)
    document.body.replaceChild(newEl, this.$el)
    this.$el = newEl

    // 更新当前的vnode
    this._vnode = newVnode;
  }
}

Vue.set = function(target, key, val) {
  // 处理数组
  if (Array.isArray(target)) {
    // 如果key是当前不存在的下标, 要通过设置length的方式填充empty
    target.length = Math.max(target.length, key)
    // 通过splice方法, 即设置了元素的值, 又触发了更新
    target.splice(key, 1, val)
    return val
  }

  // 处理对象
  // 将新属性设置为响应式
  defineReactive(target, key, val);
  // 触发observer下的dep, 
  // tip: 只要render函数中有 this.info的写法, this.info对应的__ob__就会收集依赖, 就可以派发更新
  //      不论this.info.age此时是否有值
  target.__ob__.dep.notify();
  return val
}

Vue.delete = function (target, key) {
  if (Array.isArray(target)) {  // 数组
    target.splice(key, 1)  // 移除指定下表
    return
  }

  delete target[key]  // 删除对象指定key

  target.__ob__.dep.notify()  // 手动派发更新
}





// -------------- 运行区 --------------
var vm = new Vue({
  el: '#app',
  data: {
    items: ['item0'],
    // items: [{name: 'item0'}],
    // info:{name: 'yyf'},
    // message: 'Hello world',
    // isShow: true,
  },
  render(h) {
    return h(
      'div',
      {},
      [
        h('div', {}, [
          // h('div', {}, 'this.info.name:'+this.info.name),
          // h('div', {}, 'this.info.age:'+this.info.age),
          // h('div', {}, this.info.name + ' ; ' + this.info.age),
          // h('div', {}, 'this.items[0]: '+ this.items[0]),
          h('div', {}, this.items[0] +' ; '+ this.items[1]),
          // h('div', {}, this.items[0].name),
          // h('div', {}, this.message),
        ])
      ]
    )
  },
})

setTimeout(() => {
  // vm.items[0] = 'new item0'
  // vm.items.__ob__.dep.notify()
  vm.items = ['new item0']
  // vm.items.push('item1')
  // vm.items[0].name = 'new item0'
  // Vue.set(vm.items, 0, 'new item0')
  // Vue.delete(vm.items, '0')



  // vm.info.name = 'lijian'
  // vm.info.age = '18'
  // Vue.set(vm.info, 'age', '18')
  // Vue.delete(vm.info, 'name')

}, 800);
