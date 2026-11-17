export function toInstant(zoned: Temporal.ZonedDateTime): Temporal.Instant {
	return Temporal.Instant.fromEpochNanoseconds(zoned.epochNanoseconds);
}
