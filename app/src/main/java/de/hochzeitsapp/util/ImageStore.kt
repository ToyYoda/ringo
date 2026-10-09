package de.hochzeitsapp.util

import android.content.Context
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File
import java.util.UUID

/** Keeps every photo inside app storage so it survives after the picker's permission expires. */
object ImageStore {

    private fun dir(context: Context) = File(context.filesDir, "photos").apply { mkdirs() }

    /** Creates an empty file for the camera to write into and returns its content URI. */
    fun newCameraTarget(context: Context): Pair<File, Uri> {
        val file = File(dir(context), "cam_${UUID.randomUUID()}.jpg")
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        return file to uri
    }

    /** Copies a picked image into app storage; returns a `file://` URI string or null on failure. */
    fun importPicked(context: Context, source: Uri): String? = runCatching {
        val target = File(dir(context), "img_${UUID.randomUUID()}.jpg")
        context.contentResolver.openInputStream(source)!!.use { input ->
            target.outputStream().use { input.copyTo(it) }
        }
        Uri.fromFile(target).toString()
    }.getOrNull()

    fun delete(uri: String) {
        if (uri.startsWith("file:")) runCatching { File(Uri.parse(uri).path!!).delete() }
    }
}
