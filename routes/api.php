<?php

use Illuminate\Http\Request;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider within a group which
| is assigned the "api" middleware group. Enjoy building your API!
|
*/

Route::middleware('auth:api')->get('/user', function (Request $request) {
    return $request->user();
});

Route::get('/cases/facets', 'CaseController@facets');
Route::get('/cases/{id}', 'CaseController@show');
Route::get('/cases', 'CaseController@index');
Route::get('/prescriptions', 'PrescriptionController@index');
Route::get('/prescriptions/{id}', 'PrescriptionController@show');
Route::get('/meridians', 'MeridianController@index');
Route::get('/meridian-atlas', 'MeridianController@atlas');
Route::get('/meridians/{id}', 'MeridianController@show');
Route::get('/acupoints', 'AcupointController@index');
Route::get('/acupoints/{id}', 'AcupointController@show');
Route::get('/books/{id}/chapters/{chapterId}', 'BookController@chapter');
Route::get('/books/{id}', 'BookController@show');
Route::get('/books', 'BookController@index');
Route::get('/comments', 'CommentController@index');

Route::post('/personal/session', 'PersonalController@login')->middleware('throttle:10,1');
Route::prefix('personal')->middleware(\App\Http\Middleware\PersonalSession::class)->group(function () {
    Route::get('/comments', 'CommentController@index');
    Route::post('/comments', 'CommentController@store')->middleware('throttle:10,1,comments:');
    Route::delete('/comments/{id}', 'CommentController@destroy')->where('id', '[0-9]+');
    Route::get('/session', 'PersonalController@me');
    Route::delete('/session', 'PersonalController@logout');
    Route::get('/records', 'PersonalController@index');
    Route::post('/records', 'PersonalController@save');
    Route::delete('/history', 'PersonalController@clearHistory');
    Route::post('/import', 'PersonalController@import');
    Route::post('/uploads', 'PersonalController@upload');
    Route::post('/feedback', 'PersonalController@feedback');
});
