import * as THREE from 'three'

interface SceneOptions {
  canvas: HTMLCanvasElement
  enableParallax: boolean
  onFps: (fps: number) => void
}

export interface SceneHandle {
  dispose: () => void
  setParallax: (enabled: boolean) => void
}

export function createScene({ canvas, enableParallax, onFps }: SceneOptions): SceneHandle {
  const width = canvas.clientWidth || window.innerWidth
  const height = canvas.clientHeight || window.innerHeight

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000)
  camera.position.z = 5

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(width, height, false)

  const geometry = new THREE.BoxGeometry(1.6, 1.6, 1.6)
  const material = new THREE.MeshNormalMaterial()
  const cube = new THREE.Mesh(geometry, material)
  scene.add(cube)

  let parallaxEnabled = enableParallax
  const orientation = { beta: 0, gamma: 0 }

  const handleOrientation = (e: DeviceOrientationEvent) => {
    orientation.beta = e.beta ?? 0
    orientation.gamma = e.gamma ?? 0
  }

  if (parallaxEnabled) {
    window.addEventListener('deviceorientation', handleOrientation)
  }

  let disposed = false
  let frameCount = 0
  let lastFpsStamp = performance.now()

  const animate = () => {
    if (disposed) return
    requestAnimationFrame(animate)

    cube.rotation.x += 0.008
    cube.rotation.y += 0.012

    if (parallaxEnabled) {
      const tx = Math.max(-2, Math.min(2, (orientation.gamma / 45) * 2))
      const ty = Math.max(-1.5, Math.min(1.5, (orientation.beta / 45) * 1.5))
      cube.position.x += (tx - cube.position.x) * 0.1
      cube.position.y += (ty - cube.position.y) * 0.1
    } else {
      cube.position.x += (0 - cube.position.x) * 0.1
      cube.position.y += (0 - cube.position.y) * 0.1
    }

    renderer.render(scene, camera)

    frameCount += 1
    const now = performance.now()
    const elapsed = now - lastFpsStamp
    if (elapsed >= 1000) {
      const fps = Math.round((frameCount * 1000) / elapsed)
      onFps(fps)
      frameCount = 0
      lastFpsStamp = now
    }
  }
  animate()

  const handleResize = () => {
    const w = canvas.clientWidth || window.innerWidth
    const h = canvas.clientHeight || window.innerHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h, false)
  }
  window.addEventListener('resize', handleResize)
  window.addEventListener('orientationchange', handleResize)

  return {
    dispose: () => {
      disposed = true
      window.removeEventListener('deviceorientation', handleOrientation)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleResize)
      geometry.dispose()
      material.dispose()
      renderer.dispose()
    },
    setParallax: (enabled: boolean) => {
      if (enabled === parallaxEnabled) return
      parallaxEnabled = enabled
      if (enabled) {
        window.addEventListener('deviceorientation', handleOrientation)
      } else {
        window.removeEventListener('deviceorientation', handleOrientation)
      }
    },
  }
}
