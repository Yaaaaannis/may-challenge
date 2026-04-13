import { Engine } from './core/Engine.js'
import { World } from './core/World.js'
import { Loader } from './ui/Loader.js'
import trainGlb from '../train.glb?url'

async function bootstrap() {
  const loader = new Loader()
  loader.show()

  const engine = new Engine()
  const world  = new World(engine)

  await world.init(trainGlb)

  // Scene is ready — start rendering, then shatter the overlay
  engine.start()
  await loader.shatter()
}

bootstrap().catch(console.error)
