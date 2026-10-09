package de.hochzeitsapp.ui.components

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import de.hochzeitsapp.util.ImageStore
import java.io.File

class PhotoPicker(val pickFromGallery: () -> Unit, val takePhoto: () -> Unit)

/** Camera + system photo picker; both deliver a stable `file://` URI inside app storage. */
@Composable
fun rememberPhotoPicker(onPicked: (String) -> Unit): PhotoPicker {
    val context = LocalContext.current
    // Saveable, because the camera app may cause our activity to be recreated.
    var pendingPath by rememberSaveable { mutableStateOf<String?>(null) }

    val gallery = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        uri?.let { ImageStore.importPicked(context, it) }?.let(onPicked)
    }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val f = pendingPath?.let(::File)
        if (ok && f != null && f.length() > 0) onPicked(Uri.fromFile(f).toString()) else f?.delete()
        pendingPath = null
    }
    return remember {
        PhotoPicker(
            pickFromGallery = { gallery.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
            takePhoto = {
                val (file, uri) = ImageStore.newCameraTarget(context)
                pendingPath = file.absolutePath
                camera.launch(uri)
            },
        )
    }
}

@Composable
fun PhotoSourceButtons(picker: PhotoPicker, modifier: Modifier = Modifier) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton(onClick = picker.takePhoto) {
            Icon(Icons.Default.PhotoCamera, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Kamera")
        }
        OutlinedButton(onClick = picker.pickFromGallery) {
            Icon(Icons.Default.PhotoLibrary, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Galerie")
        }
    }
}
