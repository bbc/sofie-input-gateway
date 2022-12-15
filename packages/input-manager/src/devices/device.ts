import EventEmitter from 'eventemitter3'
import { SomeFeedback } from '../feedback/feedback'
import { Logger } from '../logger'

/**
 * Description of a the "trigger got triggered" event
 *
 * @interface TriggerEventArgs
 */
export interface TriggerEventArgs {
	/** ID of the triggered trigger, needs to individually identify a single source of events: an individual button, key, input, etc. */
	triggerId: string
	/** A set of custom values describind the data received with the input event itself: pressure, voltage, value, etc. */
	arguments?: Record<string, string | number | boolean>
	/** Should this event replace whatever unsent events there are */
	replacesPrevious?: boolean
}

export interface ErrorArgs {
	error: Error
}

type DeviceEvents = {
	trigger: [e: TriggerEventArgs]
	error: [e: ErrorArgs]
}

export abstract class Device extends EventEmitter<DeviceEvents> {
	protected logger: Logger

	constructor(logger: Logger) {
		super()
		this.logger = logger
	}

	abstract setFeedback(triggerId: string, feedback: SomeFeedback): Promise<void>
	abstract clearFeedbackAll(): Promise<void>

	abstract init(): Promise<void>
	async destroy(): Promise<void> {
		this.removeAllListeners()
	}
}
