import { Server } from 'http'
import { Logger } from '../../logger'
import { Device } from '../../devices/device'
import { HTTPServerOptions } from '../../generated'

import DEVICE_OPTIONS from './$schemas/options.json'

export class HTTPServer extends Device {
	#server: Server | undefined
	#config: HTTPServerOptions

	constructor(config: HTTPServerOptions, logger: Logger) {
		super(logger)
		this.#config = config
	}

	async init(): Promise<void> {
		this.#server = new Server((req, res) => {
			const triggerId = `${req.method ?? 'GET'} ${req.url}`
			this.emit('trigger', {
				triggerId,
			})
			res.end()
		})
		this.#server.listen(this.#config.port)
	}

	async destroy(): Promise<void> {
		await super.destroy()
		if (!this.#server) return
		const server = this.#server
		return new Promise((resolve, reject) => {
			server.close((err) => {
				if (err) {
					reject(err)
					return
				}

				resolve()
			})
		})
	}

	async setFeedback(): Promise<void> {
		void ''
	}

	async clearFeedbackAll(): Promise<void> {
		void ''
	}

	static getOptionsManifest(): object {
		return DEVICE_OPTIONS
	}
}
