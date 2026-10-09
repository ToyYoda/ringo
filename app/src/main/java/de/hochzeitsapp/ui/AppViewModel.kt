package de.hochzeitsapp.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import de.hochzeitsapp.data.*
import de.hochzeitsapp.util.ImageStore
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

/** Snapshot of everything a screen needs: the wedding plus who is looking at it. */
data class UiState(
    val wedding: Wedding? = null,
    val session: Session? = null,
    val isDemo: Boolean = false,
) {
    val isCouple: Boolean get() = session is Session.Couple
    val me: Guest? get() = (session as? Session.AsGuest)?.let { s -> wedding?.guests?.find { it.id == s.guestId } }

    /** Brautpaar, Trauzeugen und Organisatoren dürfen Programm und Termine pflegen. */
    val canOrganize: Boolean get() = isCouple || me?.canOrganize == true
    val myId: String get() = if (isCouple) "couple" else me?.id ?: "anon"
    val myName: String get() = if (isCouple) wedding?.profile?.coupleNames ?: "Brautpaar" else me?.fullName ?: "Gast"

    fun visibleGroups(): List<Group> = wedding?.groups.orEmpty().filter { !(isCouple && it.hiddenFromCouple) }

    fun visibleProgram(): List<ProgramItem> = wedding?.program.orEmpty().filter { item ->
        when {
            isCouple -> !item.surprise
            canOrganize -> true
            else -> (!item.surprise && item.status == ProgramStatus.CONFIRMED) || (me != null && item.hostGuestId == me?.id)
        }
    }

    fun visiblePhotos(): List<Photo> = wedding?.photos.orEmpty().filter { p ->
        isCouple || p.approved || p.authorId == me?.id
    }

    /** Guests only see the events they were invited to. */
    fun visibleEvents(): List<WeddingEvent> = wedding?.events.orEmpty().filter { e ->
        isCouple || me?.invitedEventIds?.contains(e.id) == true
    }
}

class AppViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = WeddingRepository(app)

    val state: StateFlow<UiState> = repo.data
        .map { UiState(it.wedding, it.session, it.isDemo) }
        .stateIn(viewModelScope, SharingStarted.Eagerly, repo.data.value.let { UiState(it.wedding, it.session, it.isDemo) })

    private val s get() = state.value
    private fun edit(t: (Wedding) -> Wedding) = repo.updateWedding(t)

    // ---------- Einstieg ----------

    fun hasWedding() = repo.data.value.wedding != null

    fun startDemo(asCouple: Boolean, guestId: String? = null) = repo.update {
        val w = if (it.isDemo && it.wedding != null) it.wedding else DemoData.wedding()
        AppData(wedding = w, isDemo = true, session = if (asCouple) Session.Couple else Session.AsGuest(guestId ?: w.guests.first().id))
    }

    fun createWedding(profile: WeddingProfile, password: String) = repo.update {
        AppData(
            wedding = Wedding(
                profile = profile.copy(passwordHash = Security.hash(password)),
                checklist = DemoData.defaultChecklist(),
            ),
            isDemo = false,
            session = Session.Couple,
        )
    }

    /** Returns null on success, otherwise an error message. */
    fun loginCouple(password: String): String? {
        val w = repo.data.value.wedding ?: return "Auf diesem Gerät ist noch keine Hochzeit eingerichtet."
        if (Security.hash(password) != w.profile.passwordHash) return "Passwort ist falsch."
        repo.update { it.copy(session = Session.Couple) }
        return null
    }

    fun loginGuest(code: String): String? {
        val w = repo.data.value.wedding ?: return "Auf diesem Gerät ist noch keine Hochzeit eingerichtet."
        val g = w.guests.find { it.inviteCode.equals(code.trim(), ignoreCase = true) } ?: return "Unbekannter Einladungscode."
        repo.update { it.copy(session = Session.AsGuest(g.id)) }
        return null
    }

    fun switchSession(session: Session) = repo.update { it.copy(session = session) }

    fun logout() = repo.update { it.copy(session = null) }

    fun resetAll() = repo.update { AppData() }

    /** Demo ids are stable, so the current session stays valid. */
    fun resetDemo() = repo.update { it.copy(wedding = DemoData.wedding()) }

    // ---------- Profil ----------

    fun updateProfile(t: (WeddingProfile) -> WeddingProfile) = edit { it.copy(profile = t(it.profile)) }

    fun changePassword(newPassword: String) = updateProfile { it.copy(passwordHash = Security.hash(newPassword)) }

    // ---------- Gäste ----------

    fun saveGuest(g: Guest) = edit { w ->
        val exists = w.guests.any { it.id == g.id }
        w.copy(guests = if (exists) w.guests.map { if (it.id == g.id) g else it } else w.guests + g)
    }

    fun deleteGuest(id: String) = edit { w ->
        w.copy(
            guests = w.guests.filterNot { it.id == id },
            groups = w.groups.map { it.copy(memberIds = it.memberIds - id, contributions = it.contributions - id) },
        )
    }

    fun setRsvp(guestId: String, eventId: String, rsvp: Rsvp) = edit { w ->
        w.copy(guests = w.guests.map { if (it.id == guestId) it.copy(rsvp = it.rsvp + (eventId to rsvp)) else it })
    }

    // ---------- Termine ----------

    fun saveEvent(e: WeddingEvent, inviteAll: Boolean) = edit { w ->
        val exists = w.events.any { it.id == e.id }
        val events = if (exists) w.events.map { if (it.id == e.id) e else it } else w.events + e
        val guests = if (!exists && inviteAll) w.guests.map { it.copy(invitedEventIds = it.invitedEventIds + e.id) } else w.guests
        w.copy(events = events, guests = guests)
    }

    fun deleteEvent(id: String) = edit { w ->
        w.copy(
            events = w.events.filterNot { it.id == id },
            program = w.program.filterNot { it.eventId == id },
            guests = w.guests.map { it.copy(invitedEventIds = it.invitedEventIds - id, rsvp = it.rsvp - id) },
        )
    }

    fun setInvited(guestId: String, eventId: String, invited: Boolean) = edit { w ->
        w.copy(guests = w.guests.map {
            if (it.id != guestId) it
            else if (invited) it.copy(invitedEventIds = (it.invitedEventIds + eventId).distinct())
            else it.copy(invitedEventIds = it.invitedEventIds - eventId, rsvp = it.rsvp - eventId)
        })
    }

    // ---------- Programm ----------

    fun saveProgramItem(p: ProgramItem) = edit { w ->
        val exists = w.program.any { it.id == p.id }
        // Programmpunkte von Gästen müssen erst bestätigt werden.
        val item = if (!exists && !s.canOrganize) p.copy(status = ProgramStatus.REQUESTED) else p
        w.copy(program = if (exists) w.program.map { if (it.id == p.id) item else it } else w.program + item)
    }

    fun setProgramStatus(id: String, status: ProgramStatus) = edit { w ->
        w.copy(program = w.program.map { if (it.id == id) it.copy(status = status) else it })
    }

    fun deleteProgramItem(id: String) = edit { w -> w.copy(program = w.program.filterNot { it.id == id }) }

    // ---------- Fotos ----------

    fun addPhoto(uri: String, caption: String, category: String) = edit { w ->
        val needsApproval = !s.isCouple && w.profile.moderatePhotos
        w.copy(photos = listOf(Photo(uri = uri, caption = caption, category = category, authorName = s.myName, authorId = s.me?.id, approved = !needsApproval)) + w.photos)
    }

    private fun editPhoto(id: String, t: (Photo) -> Photo) = edit { w -> w.copy(photos = w.photos.map { if (it.id == id) t(it) else it }) }

    fun togglePhotoLike(id: String) = editPhoto(id) { p ->
        p.copy(likedBy = if (s.myId in p.likedBy) p.likedBy - s.myId else p.likedBy + s.myId)
    }

    fun commentPhoto(id: String, text: String) = editPhoto(id) { it.copy(comments = it.comments + Comment(authorName = s.myName, text = text)) }

    fun approvePhoto(id: String) = editPhoto(id) { it.copy(approved = true, reported = false) }

    fun reportPhoto(id: String) = editPhoto(id) { it.copy(reported = true) }

    fun deletePhoto(id: String) {
        s.wedding?.photos?.find { it.id == id }?.let { ImageStore.delete(it.uri) }
        edit { w -> w.copy(photos = w.photos.filterNot { it.id == id }) }
    }

    fun addCategory(name: String) = edit { w ->
        if (name.isBlank() || name in w.photoCategories) w else w.copy(photoCategories = w.photoCategories + name.trim())
    }

    fun setCover(uri: String?) = updateProfile { it.copy(coverPhoto = uri) }

    // ---------- Pinnwand & Gruppenbeiträge ----------

    fun addPost(text: String, photo: String?, groupId: String?) = edit { w ->
        w.copy(posts = listOf(Post(groupId = groupId, authorName = s.myName, authorId = s.me?.id, text = text, photo = photo)) + w.posts)
    }

    private fun editPost(id: String, t: (Post) -> Post) = edit { w -> w.copy(posts = w.posts.map { if (it.id == id) t(it) else it }) }

    fun togglePostLike(id: String) = editPost(id) { p ->
        p.copy(likedBy = if (s.myId in p.likedBy) p.likedBy - s.myId else p.likedBy + s.myId)
    }

    fun commentPost(id: String, text: String) = editPost(id) { it.copy(comments = it.comments + Comment(authorName = s.myName, text = text)) }

    fun deletePost(id: String) = edit { w -> w.copy(posts = w.posts.filterNot { it.id == id }) }

    // ---------- Geschenke ----------

    fun saveGift(g: Gift) = edit { w ->
        val exists = w.gifts.any { it.id == g.id }
        w.copy(gifts = if (exists) w.gifts.map { if (it.id == g.id) g else it } else w.gifts + g)
    }

    fun deleteGift(id: String) = edit { w -> w.copy(gifts = w.gifts.filterNot { it.id == id }) }

    fun toggleGiftReservation(id: String) = edit { w ->
        w.copy(gifts = w.gifts.map {
            when {
                it.id != id -> it
                it.reservedBy == null -> it.copy(reservedBy = s.myId)
                it.reservedBy == s.myId -> it.copy(reservedBy = null)
                else -> it
            }
        })
    }

    // ---------- Gruppen ----------

    fun saveGroup(g: Group) = edit { w ->
        val exists = w.groups.any { it.id == g.id }
        w.copy(groups = if (exists) w.groups.map { if (it.id == g.id) g else it } else w.groups + g)
    }

    fun deleteGroup(id: String) = edit { w -> w.copy(groups = w.groups.filterNot { it.id == id }, posts = w.posts.filterNot { it.groupId == id }) }

    fun joinGroup(id: String, join: Boolean) = edit { w ->
        val me = s.me?.id ?: return@edit w
        w.copy(groups = w.groups.map {
            if (it.id != id) it
            else if (join) it.copy(memberIds = (it.memberIds + me).distinct())
            else it.copy(memberIds = it.memberIds - me, contributions = it.contributions - me)
        })
    }

    fun setContribution(groupId: String, amount: Double?) = edit { w ->
        val me = s.me?.id ?: return@edit w
        w.copy(groups = w.groups.map {
            if (it.id != groupId) it
            else if (amount == null || amount <= 0) it.copy(contributions = it.contributions - me)
            else it.copy(contributions = it.contributions + (me to amount), memberIds = (it.memberIds + me).distinct())
        })
    }

    // ---------- Checkliste ----------

    fun toggleChecklist(id: String) = edit { w -> w.copy(checklist = w.checklist.map { if (it.id == id) it.copy(done = !it.done) else it }) }

    fun addChecklistItem(phase: String, text: String) = edit { w -> w.copy(checklist = w.checklist + ChecklistItem(phase = phase, text = text)) }

    fun deleteChecklistItem(id: String) = edit { w -> w.copy(checklist = w.checklist.filterNot { it.id == id }) }
}
