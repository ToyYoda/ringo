package de.hochzeitsapp.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import de.hochzeitsapp.data.Post
import de.hochzeitsapp.ui.AppViewModel
import de.hochzeitsapp.ui.UiState
import de.hochzeitsapp.ui.components.*

/** Pinnwand: wie ein Blog verfolgen Gäste die Vorbereitungen und schreiben selbst Beiträge. */
@Composable
fun TimelineScreen(ui: UiState, vm: AppViewModel) {
    val posts = ui.wedding?.posts.orEmpty().filter { it.groupId == null }
    HeaderPage(ui, "Pinnwand", "Neuigkeiten vom Brautpaar und Grüße der Gäste") {
        item { PostComposer(vm, groupId = null) }
        if (posts.isEmpty()) item { EmptyState(Icons.Default.Forum, "Noch keine Beiträge.") }
        items(posts, key = { it.id }) { PostCard(it, ui, vm) }
    }
}

@Composable
fun PostComposer(vm: AppViewModel, groupId: String?) {
    var text by remember { mutableStateOf("") }
    var photo by remember { mutableStateOf<String?>(null) }
    val picker = rememberPhotoPicker { photo = it }
    SectionCard {
        OutlinedTextField(
            text, { text = it },
            placeholder = { Text(if (groupId == null) "Was gibt's Neues?" else "Beitrag an die Gruppe …") },
            modifier = Modifier.fillMaxWidth(), minLines = 2,
        )
        photo?.let {
            Box(Modifier.padding(top = 8.dp)) {
                PhotoImage(it, Modifier.fillMaxWidth().height(160.dp).clip(RoundedCornerShape(10.dp)))
                IconButton(onClick = { photo = null }, Modifier.align(Alignment.TopEnd)) { Icon(Icons.Default.Close, "Bild entfernen") }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = picker.takePhoto) { Icon(Icons.Default.PhotoCamera, "Foto aufnehmen") }
            IconButton(onClick = picker.pickFromGallery) { Icon(Icons.Default.Image, "Bild wählen") }
            Spacer(Modifier.weight(1f))
            Button(onClick = { vm.addPost(text.trim(), photo, groupId); text = ""; photo = null }, enabled = text.isNotBlank() || photo != null) {
                Text("Posten")
            }
        }
    }
}

@Composable
fun PostCard(post: Post, ui: UiState, vm: AppViewModel) {
    var showComments by remember { mutableStateOf(false) }
    var comment by remember { mutableStateOf("") }
    val liked = ui.myId in post.likedBy
    val canDelete = ui.isCouple || (post.authorId != null && post.authorId == ui.me?.id)

    SectionCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Avatar(post.authorName, ui.wedding?.guests?.find { it.id == post.authorId }?.photo, 40.dp)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(post.authorName, fontWeight = FontWeight.SemiBold)
                Text(formatTime(post.timestamp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (canDelete) IconButton(onClick = { vm.deletePost(post.id) }) { Icon(Icons.Default.DeleteOutline, "Löschen", tint = MaterialTheme.colorScheme.outline) }
        }
        if (post.text.isNotBlank()) Text(post.text, Modifier.padding(top = 8.dp), style = MaterialTheme.typography.bodyMedium)
        post.photo?.let { PhotoImage(it, Modifier.padding(top = 8.dp).fillMaxWidth().height(200.dp).clip(RoundedCornerShape(10.dp))) }
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { vm.togglePostLike(post.id) }) {
                Icon(if (liked) Icons.Default.Favorite else Icons.Default.FavoriteBorder, "Gefällt mir", tint = MaterialTheme.colorScheme.primary)
            }
            Text("${post.likedBy.size}")
            Spacer(Modifier.width(12.dp))
            TextButton(onClick = { showComments = !showComments }) {
                Icon(Icons.Default.ChatBubbleOutline, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp))
                Text(if (post.comments.isEmpty()) "Kommentieren" else "${post.comments.size} Kommentar(e)")
            }
        }
        if (showComments) {
            post.comments.forEach { c ->
                Text(buildString { append(c.authorName); append(": "); append(c.text) }, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(vertical = 2.dp))
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(comment, { comment = it }, placeholder = { Text("Kommentar …") }, singleLine = true, modifier = Modifier.weight(1f))
                IconButton(onClick = { if (comment.isNotBlank()) { vm.commentPost(post.id, comment.trim()); comment = "" } }) { Icon(Icons.AutoMirrored.Filled.Send, "Senden") }
            }
        }
    }
}
