import { createWriteStream, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import pino from 'pino'
import PinoPretty from 'pino-pretty'

const logFile = process.env.LOG_FILE ?? 'logs/app.log'

mkdirSync(dirname(logFile), { recursive: true })

const fileStream = createWriteStream(logFile, { flags: 'a' })

const stream =
  process.env.NODE_ENV === 'production'
    ? pino.multistream([process.stdout, fileStream])
    : pino.multistream([PinoPretty({ colorize: true, sync: true }), fileStream])

export const logger = pino({ level: 'info' }, stream)
