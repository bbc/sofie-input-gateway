import EventEmitter from 'eventemitter3'
import { Device, TriggerEventArgs as DeviceTriggerEventArgs } from './devices/device'
import { SomeFeedback } from './feedback/feedback'
import { HTTPDevice, HTTPDeviceConfig, DEVICE_CONFIG as HTTP_CONFIG } from './integrations/http'
import { MIDIDevice, MIDIDeviceConfig, DEVICE_CONFIG as MIDI_CONFIG } from './integrations/midi'
import {
	StreamDeckDevice,
	StreamDeckDeviceConfig,
	DEVICE_CONFIG as STREAM_DECK_CONFIG,
} from './integrations/streamdeck'
import { XKeysDevice, XKeysDeviceConfig, DEVICE_CONFIG as XKEYS_CONFIG } from './integrations/xkeys'
import { DeviceConfigManifest, throwNever } from './lib'
import { Logger } from './logger'
import { init as initBitmapFeedback } from './feedback/bitmap'
import { DeviceType } from './integrations/deviceType'

interface Config {
	devices: Record<string, SomeDeviceConfig>
}

type DeviceConfig<Type extends string, T> = {
	type: Type
} & T

type SomeDeviceConfig =
	| DeviceConfig<DeviceType.MIDI, MIDIDeviceConfig>
	| DeviceConfig<DeviceType.HTTP, HTTPDeviceConfig>
	| DeviceConfig<DeviceType.STREAM_DECK, StreamDeckDeviceConfig>
	| DeviceConfig<DeviceType.X_KEYS, XKeysDeviceConfig>

interface TriggerEventArgs extends DeviceTriggerEventArgs {
	/** The ID of the device that issued this event */
	deviceId: string
	/** Should this event replace whatever unsent events there are */
	replacesPrevious?: boolean
}

type DeviceEvents = {
	trigger: [e: TriggerEventArgs]
}

const REFRESH_INTERVAL = 5000

class InputManager extends EventEmitter<DeviceEvents> {
	#devices: Record<string, Device> = {}
	#logger: Logger
	#refreshInterval: NodeJS.Timeout | undefined

	constructor(private config: Config, logger: Logger) {
		super()
		this.#logger = logger
	}

	async init(): Promise<void> {
		this.#devices = {}

		await initBitmapFeedback()

		await Promise.all(
			Object.entries(this.config.devices).map(async ([deviceId, deviceConfig]) =>
				this.createDevice(deviceId, deviceConfig)
			)
		)

		this.#refreshInterval = setInterval(() => {
			this.refreshDevices().catch((e) => {
				this.#logger.error(`Could not refresh devices: ${e}`)
			})
		}, REFRESH_INTERVAL)
	}

	async refreshDevices(): Promise<void> {
		await Promise.allSettled(
			Object.entries(this.config.devices).map(async ([deviceId, deviceConfig]) => {
				if (this.#devices[deviceId] !== undefined) return

				return this.createDevice(deviceId, deviceConfig)
			})
		)
	}

	private async createDevice(deviceId: string, deviceConfig: SomeDeviceConfig): Promise<void> {
		let device
		try {
			device = createNewDevice(deviceConfig, this.#logger)
			device.on('trigger', (eventArgs) => {
				this.emit('trigger', {
					...eventArgs,
					deviceId,
				})
			})
			const erroredDevice = device
			device.on('error', (errorArgs) => {
				this.#logger.error(`Error in "${deviceId}": ${errorArgs.error}`)
				erroredDevice
					.destroy()
					.catch((e) => {
						this.#logger.error(`Error when trying to destroy "${deviceId}": ${e}`)
					})
					.finally(() => {
						// this allows the device to be re-initialized in refreshDevices()
						delete this.#devices[deviceId]
					})
			})
			this.#devices[deviceId] = device

			await device.init()
		} catch (e) {
			if (device) await device.destroy()
			delete this.#devices[deviceId]
		}
	}

	async destroy(): Promise<void> {
		this.removeAllListeners()

		if (this.#refreshInterval) clearInterval(this.#refreshInterval)

		await Promise.all(Object.values(this.#devices).map(async (device) => device.destroy()))
		this.#devices = {}
	}

	async setFeedback(deviceId: string, triggerId: string, feedback: SomeFeedback): Promise<void> {
		const device = this.#devices[deviceId]
		if (!device) throw new Error(`Could not find device "${deviceId}"`)

		await device.setFeedback(triggerId, feedback)
	}

	async clearFeedbackAll(): Promise<void> {
		for (const device of Object.values(this.#devices)) {
			await device.clearFeedbackAll()
		}
	}
}

function createNewDevice(deviceConfig: SomeDeviceConfig, logger: Logger) {
	switch (deviceConfig.type) {
		case DeviceType.HTTP:
			return new HTTPDevice(deviceConfig, logger)
		case DeviceType.MIDI:
			return new MIDIDevice(deviceConfig, logger)
		case DeviceType.STREAM_DECK:
			return new StreamDeckDevice(deviceConfig, logger)
		case DeviceType.X_KEYS:
			return new XKeysDevice(deviceConfig, logger)
		default:
			throwNever(deviceConfig)
	}
}

function getIntegrationsConfigManifest(): Record<string, DeviceConfigManifest<any>> {
	return {
		[DeviceType.HTTP]: HTTP_CONFIG,
		[DeviceType.MIDI]: MIDI_CONFIG,
		[DeviceType.STREAM_DECK]: STREAM_DECK_CONFIG,
		[DeviceType.X_KEYS]: XKEYS_CONFIG,
	}
}

export { InputManager, SomeDeviceConfig, TriggerEventArgs, getIntegrationsConfigManifest }
