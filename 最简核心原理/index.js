// -------------- 2 最简核心原理 --------------
; (function () {
  return
  const app = document.getElementById('app')


  // 我们的数据
  const data = {
    name: 'yyf',
  }

  // 初始化数据到页面
  app.innerHTML = data.name

  // 监听数据改变修改页面
  let val = data.name
  Object.defineProperty(data, 'name', {
    get: function () {
      return val
    },
    set: function (newVal) {
      val = newVal;
      app.innerHTML = val
    }
  })


  setTimeout(() => {
    data.name = 'lijian'
  }, 800);
})()