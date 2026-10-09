package de.hochzeitsapp.data

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import java.io.File
import java.security.MessageDigest

object Security {
    fun hash(password: String): String =
        MessageDigest.getInstance("SHA-256").digest(("hochzeit:" + password).toByteArray())
            .joinToString("") { "%02x".format(it) }
}

/**
 * Single source of truth for all wedding data.
 *
 * Stores everything as one JSON document on the device. All mutations go through [update],
 * so a remote backend (e.g. Firebase) can later replace the file persistence without
 * touching the UI layer.
 */
class WeddingRepository(context: Context) {

    private val file = File(context.filesDir, "wedding.json")
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val writeLock = Mutex()

    private val _data = MutableStateFlow(load())
    val data: StateFlow<AppData> = _data.asStateFlow()

    private fun load(): AppData = runCatching {
        if (file.exists()) json.decodeFromString(AppData.serializer(), file.readText()) else AppData()
    }.getOrElse { AppData() }

    fun update(transform: (AppData) -> AppData) {
        _data.update(transform)
        persist()
    }

    fun updateWedding(transform: (Wedding) -> Wedding) = update { d ->
        d.wedding?.let { d.copy(wedding = transform(it)) } ?: d
    }

    private fun persist() {
        scope.launch {
            writeLock.withLock {
                // Always write the latest state, so out-of-order launches can't persist stale data.
                val snapshot = _data.value
                val tmp = File(file.parentFile, "wedding.json.tmp")
                tmp.writeText(json.encodeToString(AppData.serializer(), snapshot))
                tmp.renameTo(file)
            }
        }
    }
}
