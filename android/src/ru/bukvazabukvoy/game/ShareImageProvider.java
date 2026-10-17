package ru.bukvazabukvoy.game;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;

/** Передаёт только созданные игрой PNG, только на чтение, с временным URI-разрешением. */
public final class ShareImageProvider extends ContentProvider {
    @Override public boolean onCreate() { return true; }

    private File image(Uri uri) throws FileNotFoundException {
        if (!"content".equals(uri.getScheme()) || !"ru.bukvazabukvoy.game.share".equals(uri.getAuthority())
            || uri.getPathSegments().size() != 1 || uri.getQuery() != null || uri.getFragment() != null) {
            throw new FileNotFoundException("Недопустимый адрес");
        }
        String name = uri.getLastPathSegment();
        if (name == null || !name.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.png")) {
            throw new FileNotFoundException("Недопустимое имя");
        }
        File file = new File(new File(getContext().getCacheDir(), "shared-images"), name);
        if (!file.isFile()) throw new FileNotFoundException("Картинка уже удалена");
        return file;
    }

    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!"r".equals(mode)) throw new FileNotFoundException("Доступно только чтение");
        return ParcelFileDescriptor.open(image(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }
    @Override public String getType(Uri uri) {
        try { image(uri); return "image/png"; } catch (FileNotFoundException exception) { return null; }
    }
    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sortOrder) {
        try {
            File file = image(uri);
            String[] columns = projection == null ? new String[] {OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE} : projection;
            MatrixCursor result = new MatrixCursor(columns);
            Object[] row = new Object[columns.length];
            for (int index = 0; index < columns.length; index++) {
                if (OpenableColumns.DISPLAY_NAME.equals(columns[index])) row[index] = "Буква за буквой.png";
                else if (OpenableColumns.SIZE.equals(columns[index])) row[index] = file.length();
            }
            result.addRow(row);
            return result;
        } catch (FileNotFoundException exception) { return null; }
    }
    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException("Только чтение"); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { throw new UnsupportedOperationException("Только чтение"); }
    @Override public int delete(Uri uri, String selection, String[] args) { throw new UnsupportedOperationException("Только чтение"); }
}
