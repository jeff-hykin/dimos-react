// LCM wire format (ported from dim-controller core/lcm/lcm.ts), driven by the dimos_lcm schemas (vendor/lcm_schemas.js): big-endian, an
// 8-byte fingerprint before the top-level struct only, strings as int32 length (with the NUL) + bytes + NUL.
import schemaJson from "./vendor/lcm_schemas.js"

/** @type {Record<string, { name: string, type: string, dims: (number | string)[] }[]>} */
export const schemas: Record<string, { name: string; type: string; dims: (number | string)[] }[]> = schemaJson

const textDecoder = new TextDecoder()
const textEncoder = new TextEncoder()

class Reader {
    offset: any
    view: DataView<any>
    bytes: any
    constructor(bytes, offset) {
        this.bytes = bytes
        this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        this.offset = offset
    }
    primitive(type) {
        const view = this.view
        const at = this.offset
        switch (type) {
            case "int8_t":
                this.offset += 1
                return view.getInt8(at)
            case "byte":
                this.offset += 1
                return view.getUint8(at)
            case "boolean":
                this.offset += 1
                return view.getInt8(at) !== 0
            case "int16_t":
                this.offset += 2
                return view.getInt16(at)
            case "int32_t":
                this.offset += 4
                return view.getInt32(at)
            case "int64_t":
                this.offset += 8
                return Number(view.getBigInt64(at))
            case "float":
                this.offset += 4
                return view.getFloat32(at)
            case "double":
                this.offset += 8
                return view.getFloat64(at)
            case "string": {
                const length = view.getInt32(at)
                this.offset += 4 + length
                return textDecoder.decode(this.bytes.subarray(at + 4, at + 4 + Math.max(0, length - 1)))
            }
        }
        throw new Error(`lcm: unknown primitive ${type}`)
    }
    struct(type) {
        const fields = schemas[type]
        if (!fields) {
            throw new Error(`lcm: no schema for ${type}`)
        }
        const out = {}
        for (const field of fields) {
            out[field.name] = this.value(field.type, field.dims, 0, out)
        }
        return out
    }
    value(type, dims, depth, scope) {
        if (depth === dims.length) {
            return type in schemas ? this.struct(type) : this.primitive(type)
        }
        const dim = dims[depth]
        const length = typeof dim === "number" ? dim : Number(scope[dim])
        // a 1-d byte / int8 array stays a view into the payload (images, occupancy grids, blobs)
        if ((type === "byte" || type === "int8_t") && depth === dims.length - 1) {
            const view = this.bytes.subarray(this.offset, this.offset + length)
            this.offset += length
            return type === "byte" ? view : new Int8Array(view.buffer, view.byteOffset, view.byteLength)
        }
        const items = new Array(length)
        for (let index = 0; index < length; index++) {
            items[index] = this.value(type, dims, depth + 1, scope)
        }
        return items
    }
}

/** Decodes a dimos payload (fingerprint + struct) of `type`, e.g. "nav_msgs.Odometry"; a different type's bytes throw. */
export function decode(type, bytes) {
    const expected = fingerprint(type)
    for (let index = 0; index < 8; index++) {
        if (bytes[index] !== expected[index]) {
            throw new Error(`not a ${type} (fingerprint mismatch)`)
        }
    }
    return new Reader(bytes, 8).struct(type)
}

/** Reads just the header's frame_id off a stamped message without decoding the rest (clouds, images). */
export function headerFrameId(type, bytes) {
    const fields = schemas[type]
    if (!fields) {
        return null
    }
    const reader = new Reader(bytes, 8)
    for (const field of fields) {
        if (field.name === "header" && field.type === "std_msgs.Header") {
            return reader.struct("std_msgs.Header").frame_id
        }
        if (field.dims.length || field.type in schemas) {
            return null // the header is after something variable; not worth walking
        }
        reader.primitive(field.type)
    }
    return null
}

// ── encoding ──

const MASK = (1n << 64n) - 1n
function hashUpdate(value, char) {
    // lcmgen's int64 arithmetic: ((v << 8) ^ (v >> 55)) + c, with c a signed char
    const signed = BigInt.asIntN(64, value)
    return BigInt.asIntN(64, ((signed << 8n) ^ (signed >> 55n)) + BigInt(char > 127 ? char - 256 : char))
}
function hashString(value, text) {
    value = hashUpdate(value, text.length)
    for (const char of textEncoder.encode(text)) {
        value = hashUpdate(value, char)
    }
    return value
}
function baseHash(type) {
    let value = 0x12345678n
    for (const field of schemas[type]) {
        value = hashString(value, field.name)
        if (!(field.type in schemas)) {
            value = hashString(value, field.type)
        }
        value = hashUpdate(value, field.dims.length)
        for (const dim of field.dims) {
            value = hashUpdate(value, typeof dim === "number" ? 0 : 1)
            value = hashString(value, String(dim))
        }
    }
    return value
}
function recursiveHash(type, parents) {
    if (parents.includes(type)) {
        return 0n
    }
    let value = BigInt.asUintN(64, baseHash(type))
    for (const field of schemas[type]) {
        if (field.type in schemas) {
            value = (value + recursiveHash(field.type, [...parents, type])) & MASK
        }
    }
    return (((value << 1n) & MASK) + (value >> 63n)) & MASK
}
const fingerprints = new Map()
/** The 8 bytes every top-level LCM message of `type` starts with. */
export function fingerprint(type) {
    let bytes = fingerprints.get(type)
    if (!bytes) {
        bytes = new Uint8Array(8)
        new DataView(bytes.buffer).setBigUint64(0, recursiveHash(type, []))
        fingerprints.set(type, bytes)
    }
    return bytes
}

class Writer {
    chunks = []
    view = new DataView(new ArrayBuffer(8))
    push(count) {
        for (let index = 0; index < count; index++) {
            this.chunks.push(this.view.getUint8(index))
        }
    }
    primitive(type, value) {
        const view = this.view
        switch (type) {
            case "int8_t":
                view.setInt8(0, value ?? 0)
                return this.push(1)
            case "byte":
                view.setUint8(0, value ?? 0)
                return this.push(1)
            case "boolean":
                view.setInt8(0, value ? 1 : 0)
                return this.push(1)
            case "int16_t":
                view.setInt16(0, value ?? 0)
                return this.push(2)
            case "int32_t":
                view.setInt32(0, value ?? 0)
                return this.push(4)
            case "int64_t":
                view.setBigInt64(0, BigInt(Math.trunc(value ?? 0)))
                return this.push(8)
            case "float":
                view.setFloat32(0, value ?? 0)
                return this.push(4)
            case "double":
                view.setFloat64(0, value ?? 0)
                return this.push(8)
            case "string": {
                const bytes = textEncoder.encode(value ?? "")
                view.setInt32(0, bytes.length + 1)
                this.push(4)
                this.chunks.push(...bytes, 0)
                return
            }
        }
        throw new Error(`lcm: unknown primitive ${type}`)
    }
    struct(type, value) {
        const scope = { ...value }
        // array length fields follow their arrays unless given explicitly
        for (const field of schemas[type]) {
            for (const dim of field.dims) {
                if (typeof dim === "string" && scope[dim] === undefined) {
                    scope[dim] = (value[field.name] ?? []).length
                }
            }
        }
        for (const field of schemas[type]) {
            this.value(field.type, field.dims, 0, scope[field.name])
        }
    }
    value(type, dims, depth, value) {
        if (depth === dims.length) {
            return type in schemas ? this.struct(type, value ?? {}) : this.primitive(type, value)
        }
        for (const item of value ?? []) {
            this.value(type, dims, depth + 1, item)
        }
    }
}

/** Encodes `value` as a dimos payload of `type` (missing fields are zero). */
export function encode(type, value) {
    const writer = new Writer()
    writer.struct(type, value)
    const out = new Uint8Array(8 + writer.chunks.length)
    out.set(fingerprint(type))
    out.set(writer.chunks, 8)
    return out
}
