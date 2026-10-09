package de.hochzeitsapp.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import de.hochzeitsapp.data.ProgramStatus
import de.hochzeitsapp.data.Rsvp
import de.hochzeitsapp.ui.AppViewModel
import de.hochzeitsapp.ui.UiState
import de.hochzeitsapp.ui.components.*
import de.hochzeitsapp.ui.theme.Script
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.concurrent.TimeUnit

private fun daysUntil(date: String): Long? = runCatching {
    val d = SimpleDateFormat("dd.MM.yyyy", Locale.GERMANY).parse(date)!!
    TimeUnit.MILLISECONDS.toDays(d.time - System.currentTimeMillis()) + 1
}.getOrNull()

@Composable
fun HomeScreen(ui: UiState, vm: AppViewModel, navigate: (String) -> Unit) {
    val w = ui.wedding ?: return
    val p = w.profile
    var editing by remember { mutableStateOf(false) }

    val listState = rememberLazyListState()
    Scaffold(contentWindowInsets = WindowInsets(0)) { pad ->
      Box(Modifier.padding(pad)) {
        LazyColumn(state = listState, contentPadding = PaddingValues(bottom = 32.dp)) {
            item { WeddingHeader(p.motto, p.coupleNames, p.coverPhoto, big = true) }

            item {
                Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(p.headline.ifBlank { "Willkommen" }, style = MaterialTheme.typography.headlineMedium)
                            if (p.subline.isNotBlank()) Text(p.subline, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.secondary)
                        }
                        if (ui.isCouple) IconButton(onClick = { editing = true }) { Icon(Icons.Default.Edit, "Startseite bearbeiten") }
                    }
                    if (p.introText.isNotBlank()) {
                        Spacer(Modifier.height(8.dp))
                        Text(p.introText, style = MaterialTheme.typography.bodyLarge)
                    }
                }
            }

            val mainDate = p.venues.firstOrNull { it.date.isNotBlank() }?.date
            val days = mainDate?.let(::daysUntil)
            if (days != null && days > 0) {
                item {
                    SectionCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("$days", style = MaterialTheme.typography.displaySmall, color = MaterialTheme.colorScheme.primary, fontFamily = Script)
                            Spacer(Modifier.width(12.dp))
                            Text(if (days == 1L) "Tag bis zum großen Tag" else "Tage bis zum großen Tag", style = MaterialTheme.typography.titleMedium)
                        }
                    }
                }
            }

            if (ui.isCouple) item { CoupleDashboard(ui, navigate) } else item { GuestRsvpCard(ui, vm, navigate) }

            if (p.celebrationText.isNotBlank()) {
                item {
                    SectionCard(title = "So möchten wir unsere Hochzeit feiern", icon = Icons.Default.Celebration) {
                        Text(p.celebrationText, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }

            val photos = ui.visiblePhotos().filter { it.approved }.take(10)
            if (photos.isNotEmpty()) {
                item { SectionTitle("Neueste Fotos") }
                item {
                    LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(photos, key = { it.id }) { ph ->
                            PhotoImage(ph.uri, Modifier.size(110.dp).clip(RoundedCornerShape(12.dp)).clickable { navigate("photo/${ph.id}") })
                        }
                    }
                }
            }

            val posts = w.posts.filter { it.groupId == null }.take(2)
            if (posts.isNotEmpty()) {
                item { SectionTitle("Pinnwand") }
                items(posts, key = { it.id }) { post ->
                    SectionCard(Modifier.clickable { navigate("timeline") }) {
                        Text(post.authorName, fontWeight = FontWeight.SemiBold)
                        Text(post.text, maxLines = 3, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }

            item {
                SectionTitle("Entdecken")
                val tiles = listOf(
                    Triple(Icons.Default.Info, "Details", "details"),
                    Triple(Icons.Default.Schedule, "Programm", "program"),
                    Triple(Icons.Default.CardGiftcard, "Geschenke", "gifts"),
                    Triple(Icons.Default.Groups, "Gäste", "guests"),
                )
                Row(Modifier.padding(horizontal = 12.dp)) {
                    tiles.forEach { (icon, label, route) -> QuickTile(icon, label, Modifier.weight(1f)) { navigate(route) } }
                }
            }
        }
        StatusBarScrim(listState)
      }
    }

    if (editing) EditHomeDialog(ui, vm) { editing = false }
}

@Composable
private fun QuickTile(icon: ImageVector, label: String, modifier: Modifier, onClick: () -> Unit) {
    OutlinedCard(modifier.padding(4.dp).clickable(onClick = onClick)) {
        Column(Modifier.fillMaxWidth().padding(vertical = 14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(icon, null, tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(4.dp))
            Text(label, style = MaterialTheme.typography.labelMedium, textAlign = TextAlign.Center)
        }
    }
}

@Composable
private fun CoupleDashboard(ui: UiState, navigate: (String) -> Unit) {
    val w = ui.wedding ?: return
    val answers = w.guests.flatMap { g -> g.invitedEventIds.map { g.rsvp[it] ?: Rsvp.OPEN } }
    val requests = w.program.count { it.status == ProgramStatus.REQUESTED && !it.surprise }
    val pendingPhotos = w.photos.count { !it.approved || it.reported }
    val done = w.checklist.count { it.done }

    SectionCard(title = "Überblick", icon = Icons.Default.Dashboard) {
        Row {
            Stat("${w.guests.size}", "Gäste", Modifier.weight(1f)) { navigate("guests") }
            Stat("${answers.count { it == Rsvp.YES }}", "Zusagen", Modifier.weight(1f)) { navigate("events") }
            Stat("${answers.count { it == Rsvp.OPEN }}", "offen", Modifier.weight(1f)) { navigate("events") }
        }
        if (requests > 0 || pendingPhotos > 0) HorizontalDivider(Modifier.padding(vertical = 8.dp))
        if (requests > 0) TodoRow(Icons.Default.PendingActions, "$requests Programmpunkt(e) warten auf Bestätigung") { navigate("program") }
        if (pendingPhotos > 0) TodoRow(Icons.Default.PhotoLibrary, "$pendingPhotos Foto(s) zur Freigabe/Prüfung") { navigate("gallery") }
        if (w.checklist.isNotEmpty()) {
            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            TodoRow(Icons.Default.Checklist, "Checkliste: $done von ${w.checklist.size} erledigt") { navigate("planning") }
            LinearProgressIndicator(progress = { done.toFloat() / w.checklist.size }, modifier = Modifier.fillMaxWidth().padding(top = 4.dp))
        }
    }
}

@Composable
private fun Stat(value: String, label: String, modifier: Modifier, onClick: () -> Unit) {
    Column(modifier.clickable(onClick = onClick).padding(4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun TodoRow(icon: ImageVector, text: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.secondary, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(10.dp))
        Text(text, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        Icon(Icons.Default.ChevronRight, null, tint = MaterialTheme.colorScheme.outline)
    }
}

/** Guests see their open invitations right on the start page and can answer immediately. */
@Composable
private fun GuestRsvpCard(ui: UiState, vm: AppViewModel, navigate: (String) -> Unit) {
    val me = ui.me ?: return
    val events = ui.visibleEvents()
    if (events.isEmpty()) return
    SectionCard(title = "Hallo ${me.firstName}! Deine Einladungen", icon = Icons.Default.MarkEmailRead) {
        events.forEach { e ->
            val r = me.rsvp[e.id] ?: Rsvp.OPEN
            Column(Modifier.padding(vertical = 6.dp)) {
                Text(e.title, fontWeight = FontWeight.SemiBold)
                Text("${e.date} ${e.time}".trim(), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                RsvpButtons(r) { vm.setRsvp(me.id, e.id, it) }
            }
        }
        TextButton(onClick = { navigate("events") }) { Text("Alle Termine ansehen") }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RsvpButtons(current: Rsvp, onChange: (Rsvp) -> Unit) {
    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(top = 4.dp)) {
        listOf(Rsvp.YES to "Zusagen", Rsvp.NO to "Absagen").forEachIndexed { i, (r, label) ->
            SegmentedButton(
                selected = current == r,
                onClick = { onChange(if (current == r) Rsvp.OPEN else r) },
                shape = SegmentedButtonDefaults.itemShape(i, 2),
            ) { Text(label) }
        }
    }
}

@Composable
private fun EditHomeDialog(ui: UiState, vm: AppViewModel, onDismiss: () -> Unit) {
    val p = ui.wedding!!.profile
    var motto by remember { mutableStateOf(p.motto) }
    var headline by remember { mutableStateOf(p.headline) }
    var subline by remember { mutableStateOf(p.subline) }
    var intro by remember { mutableStateOf(p.introText) }
    var celebration by remember { mutableStateOf(p.celebrationText) }
    var cover by remember { mutableStateOf(p.coverPhoto) }
    val picker = rememberPhotoPicker { cover = it }

    FormDialog("Startseite bearbeiten", onDismiss, onSave = {
        vm.updateProfile { it.copy(motto = motto, headline = headline, subline = subline, introText = intro, celebrationText = celebration, coverPhoto = cover) }
        onDismiss()
    }) {
        Text("Titelfoto", style = MaterialTheme.typography.titleSmall)
        cover?.let { PhotoImage(it, Modifier.fillMaxWidth().height(140.dp).clip(RoundedCornerShape(12.dp))) }
        Row(verticalAlignment = Alignment.CenterVertically) {
            PhotoSourceButtons(picker)
            if (cover != null) TextButton(onClick = { cover = null }) { Text("Entfernen") }
        }
        Field(motto, { motto = it }, "Motto")
        Field(headline, { headline = it }, "Überschrift")
        Field(subline, { subline = it }, "Unterzeile")
        Field(intro, { intro = it }, "Vorstellung", singleLine = false, minLines = 4)
        Field(celebration, { celebration = it }, "So möchten wir unsere Hochzeit feiern", singleLine = false, minLines = 4)
    }
}
