package de.hochzeitsapp.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import de.hochzeitsapp.data.Photo
import de.hochzeitsapp.ui.AppViewModel
import de.hochzeitsapp.ui.UiState
import de.hochzeitsapp.ui.components.*
import de.hochzeitsapp.util.ImageStore
import java.io.File

/** Fotogalerie: Collage, Kategorien, Upload per Kamera, Freigabe durch das Brautpaar. */
@Composable
fun GalleryScreen(ui: UiState, vm: AppViewModel, navigate: (String) -> Unit) {
    val w = ui.wedding ?: return
    var category by rememberSaveable { mutableStateOf<String?>(null) }
    var newPhoto by remember { mutableStateOf<String?>(null) }
    var addMenu by remember { mutableStateOf(false) }
    val picker = rememberPhotoPicker { newPhoto = it }

    val all = ui.visiblePhotos().sortedByDescending { it.timestamp }
    val pending = if (ui.isCouple) all.filter { !it.approved || it.reported } else emptyList()
    val shown = all.filter { (it.approved || !ui.isCouple) && !(ui.isCouple && it.reported) && (category == null || it.category == category) }

    HeaderPage(
        ui, "Fotogalerie", "Unsere schönsten Momente – und eure! Fotografiert, ladet hoch, kommentiert.",
        fab = {
            Box {
                FloatingActionButton(onClick = { addMenu = true }) { Icon(Icons.Default.AddAPhoto, "Foto hinzufügen") }
                DropdownMenu(addMenu, { addMenu = false }) {
                    DropdownMenuItem(text = { Text("Foto aufnehmen") }, leadingIcon = { Icon(Icons.Default.PhotoCamera, null) }, onClick = { addMenu = false; picker.takePhoto() })
                    DropdownMenuItem(text = { Text("Aus Galerie wählen") }, leadingIcon = { Icon(Icons.Default.PhotoLibrary, null) }, onClick = { addMenu = false; picker.pickFromGallery() })
                }
            }
        },
    ) {
        if (pending.isNotEmpty()) {
            item { SectionTitle("Zur Freigabe (${pending.size})") }
            items(pending, key = { "p" + it.id }) { ph ->
                SectionCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        PhotoImage(ph.uri, Modifier.size(72.dp).clip(RoundedCornerShape(8.dp)).clickable { navigate("photo/${ph.id}") })
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(ph.caption.ifBlank { "Ohne Titel" }, fontWeight = FontWeight.SemiBold)
                            Text("von ${ph.authorName}", style = MaterialTheme.typography.bodySmall)
                            if (ph.reported) Pill("Gemeldet", MaterialTheme.colorScheme.errorContainer, MaterialTheme.colorScheme.onErrorContainer)
                        }
                        IconButton(onClick = { vm.approvePhoto(ph.id) }) { Icon(Icons.Default.Check, "Freigeben", tint = MaterialTheme.colorScheme.tertiary) }
                        IconButton(onClick = { vm.deletePhoto(ph.id) }) { Icon(Icons.Default.Delete, "Löschen", tint = MaterialTheme.colorScheme.error) }
                    }
                }
            }
        }
        item {
            Row(
                Modifier
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FilterChip(category == null, { category = null }, label = { Text("Alle") })
                w.photoCategories.forEach { c -> FilterChip(category == c, { category = if (category == c) null else c }, label = { Text(c) }) }
            }
        }
        if (shown.isEmpty()) item { EmptyState(Icons.Default.PhotoLibrary, "Noch keine Fotos. Seid die Ersten!") }
        // Collage: abwechselnd ein großes Bild und eine Zweierreihe
        val rows = collageRows(shown)
        items(rows.size) { i ->
            val row = rows[i]
            Row(Modifier.padding(horizontal = 16.dp, vertical = 3.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                row.forEach { ph -> PhotoTile(ph, ui, Modifier.weight(1f).aspectRatio(if (row.size == 1) 16f / 10f else 1f)) { navigate("photo/${ph.id}") } }
            }
        }
    }

    newPhoto?.let { uri ->
        var caption by remember(uri) { mutableStateOf("") }
        var cat by remember(uri) { mutableStateOf(category ?: w.photoCategories.first()) }
        var newCat by remember(uri) { mutableStateOf("") }
        FormDialog("Foto hochladen", { ImageStore.delete(uri); newPhoto = null }, onSave = {
            val finalCat = newCat.trim().ifBlank { cat }
            if (newCat.isNotBlank()) vm.addCategory(finalCat)
            vm.addPhoto(uri, caption, finalCat)
            newPhoto = null
        }) {
            PhotoImage(uri, Modifier.fillMaxWidth().height(240.dp).clip(RoundedCornerShape(12.dp)))
            Field(caption, { caption = it }, "Bildbeschreibung")
            Picker("Kategorie", w.photoCategories, cat, { it }, { cat = it })
            Field(newCat, { newCat = it }, "… oder neue Kategorie")
            if (!ui.isCouple && w.profile.moderatePhotos) Text("Das Foto wird nach Freigabe durch das Brautpaar für alle sichtbar.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
        }
    }
}

private fun collageRows(photos: List<Photo>): List<List<Photo>> {
    val rows = mutableListOf<List<Photo>>()
    var i = 0
    var big = true
    while (i < photos.size) {
        val n = if (big) 1 else 2
        rows += photos.subList(i, minOf(i + n, photos.size))
        i += n
        big = !big
    }
    return rows
}

@Composable
private fun PhotoTile(ph: Photo, ui: UiState, modifier: Modifier, onClick: () -> Unit) {
    Box(modifier.clip(RoundedCornerShape(10.dp)).clickable(onClick = onClick)) {
        PhotoImage(ph.uri, Modifier.fillMaxSize())
        Row(
            Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .background(Color(0x66000000))
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(ph.caption, color = Color.White, style = MaterialTheme.typography.labelMedium, maxLines = 1, modifier = Modifier.weight(1f))
            if (ph.likedBy.isNotEmpty()) {
                Icon(Icons.Default.Favorite, null, tint = Color.White, modifier = Modifier.size(14.dp))
                Text(" ${ph.likedBy.size}", color = Color.White, style = MaterialTheme.typography.labelSmall)
            }
            if (ph.comments.isNotEmpty()) {
                Spacer(Modifier.width(6.dp))
                Icon(Icons.Default.ChatBubble, null, tint = Color.White, modifier = Modifier.size(13.dp))
                Text(" ${ph.comments.size}", color = Color.White, style = MaterialTheme.typography.labelSmall)
            }
        }
        if (!ph.approved) Box(Modifier.align(Alignment.TopStart).padding(6.dp)) { Pill("Wartet auf Freigabe") }
    }
}


@Composable
fun PhotoDetailScreen(ui: UiState, vm: AppViewModel, photoId: String, onBack: () -> Unit) {
    val ph = ui.wedding?.photos?.find { it.id == photoId }
    if (ph == null) { NotFound(onBack); return }
    val context = LocalContext.current
    var comment by remember { mutableStateOf("") }
    var confirmDelete by remember { mutableStateOf(false) }
    val canDelete = ui.isCouple || (ph.authorId != null && ph.authorId == ui.me?.id)
    val liked = ui.myId in ph.likedBy

    Scaffold(
        containerColor = Color(0xFF1C1517),
        bottomBar = {
            Surface(color = MaterialTheme.colorScheme.surface) {
                Row(Modifier.navigationBarsPadding().imePadding().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(comment, { comment = it }, placeholder = { Text("Kommentar schreiben …") }, modifier = Modifier.weight(1f), singleLine = true)
                    IconButton(onClick = { if (comment.isNotBlank()) { vm.commentPhoto(ph.id, comment.trim()); comment = "" } }) { Icon(Icons.AutoMirrored.Filled.Send, "Senden") }
                }
            }
        },
    ) { pad ->
        LazyColumn(Modifier.padding(pad)) {
            item {
                Box {
                    PhotoImage(ph.uri, Modifier.fillMaxWidth().heightIn(min = 280.dp).aspectRatio(4f / 3f), contentScale = ContentScale.Fit)
                    IconButton(onClick = onBack, Modifier.statusBarsPadding().padding(4.dp)) { Icon(Icons.Default.Close, "Schließen", tint = Color.White) }
                }
            }
            item {
                Surface(color = MaterialTheme.colorScheme.background) {
                    Column(Modifier.fillMaxWidth().padding(16.dp)) {
                        if (ph.caption.isNotBlank()) Text(ph.caption, style = MaterialTheme.typography.titleLarge)
                        Text("${ph.authorName} · ${formatTime(ph.timestamp)} · ${ph.category}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            IconButton(onClick = { vm.togglePhotoLike(ph.id) }) {
                                Icon(if (liked) Icons.Default.Favorite else Icons.Default.FavoriteBorder, "Gefällt mir", tint = MaterialTheme.colorScheme.primary)
                            }
                            Text("${ph.likedBy.size}")
                            Spacer(Modifier.weight(1f))
                            if (!ph.uri.startsWith("demo:")) IconButton(onClick = { sharePhoto(context, ph.uri) }) { Icon(Icons.Default.Share, "Teilen") }
                            if (ui.isCouple) IconButton(onClick = { vm.setCover(ph.uri) }) { Icon(Icons.Default.Wallpaper, "Als Titelfoto") }
                            if (ui.isCouple && !ph.approved) IconButton(onClick = { vm.approvePhoto(ph.id) }) { Icon(Icons.Default.Check, "Freigeben") }
                            if (!ui.isCouple && !ph.reported && !canDelete) IconButton(onClick = { vm.reportPhoto(ph.id) }) { Icon(Icons.Default.Flag, "Melden") }
                            if (canDelete) IconButton(onClick = { confirmDelete = true }) { Icon(Icons.Default.Delete, "Löschen") }
                        }
                        if (ph.reported && !ui.isCouple) Text("Gemeldet – das Brautpaar prüft das Foto.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                        HorizontalDivider(Modifier.padding(vertical = 8.dp))
                        if (ph.comments.isEmpty()) Text("Noch keine Kommentare.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        ph.comments.forEach { c ->
                            Row(Modifier.padding(vertical = 6.dp)) {
                                Avatar(c.authorName, null, 32.dp)
                                Spacer(Modifier.width(10.dp))
                                Column {
                                    Text(c.authorName, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodySmall)
                                    Text(c.text, style = MaterialTheme.typography.bodyMedium)
                                }
                            }
                        }
                        Spacer(Modifier.height(200.dp))
                    }
                }
            }
        }
    }
    if (confirmDelete) ConfirmDialog("Foto löschen?", "Das Foto wird endgültig entfernt.", onConfirm = { vm.deletePhoto(ph.id); onBack() }, onDismiss = { confirmDelete = false })
}

private fun sharePhoto(context: android.content.Context, uri: String) {
    val path = Uri.parse(uri).path ?: return
    val content = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", File(path))
    val i = Intent(Intent.ACTION_SEND).apply { type = "image/jpeg"; putExtra(Intent.EXTRA_STREAM, content); addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION) }
    context.startActivity(Intent.createChooser(i, "Foto teilen"))
}
